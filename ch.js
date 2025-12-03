// app.js - Main Express server with MongoDB
const express = require('express');
const path = require('path');
const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');
const axios = require('axios');
require('dotenv').config();
const StaticRoute = require('./routes/user');
const Comic = require('./models/comic'); // Import Comic model
const app = express();
const PORT = process.env.PORT || 3000;
const { connectDB } = require("./connect");
const cookieParser = require('cookie-parser');
const { getUser } = require('./service/auth');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use('/user', StaticRoute);
app.use(cookieParser());

// Initialize Gemini AI
const ai = new GoogleGenAI({});

// Ensure directories exist
const publicDir = path.join(__dirname, 'public');
const viewsDir = path.join(__dirname, 'views');
const imagesDir = path.join(__dirname, 'public', 'generated');

[publicDir, viewsDir, imagesDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Connect to MongoDB
connectDB().then(() => console.log("🚀 Connected to MongoDB"))
           .catch(err => console.error("❌ Failed to connect to MongoDB:", err));

// Set up EJS
app.set('view engine', 'ejs');
app.set('views', viewsDir);

// Middleware: populate req.user
app.use((req, res, next) => {
  try {
    const token = req.cookies?.uid;
    if (token) {
      const user = getUser(token);
      if (user) {
        req.user = user;
        res.locals.user = user;
      }
    }
  } catch (err) { }
  next();
});

// ---------------- Routes ----------------

// Home page
app.get('/', (req, res) => res.render('home', { user: req.user }));

// Comic creation page
app.get('/create', (req, res) => res.render('index', { title: 'AI Comic Generator' }));

// User gallery: only comics by logged-in user
app.get('/gallery', async (req, res) => {
  if (!req.user) return res.redirect('/login');

  try {
    const comics = await Comic.find({ 
      status: 'completed',
      createdBy: req.user._id
    })
    .sort({ createdAt: -1 })
    .lean();

    res.render('gallery', { title: 'Your Comic Gallery', comics });

  } catch (error) {
    console.error('Error fetching comics:', error);
    res.render('gallery', { title: 'Your Comic Gallery', comics: [], error: 'Failed to load comics' });
  }
});

// View a single comic
app.get('/comic/:id', async (req, res) => {
  try {
    const comic = await Comic.findOne({ comicId: req.params.id }).lean();
    if (!comic) return res.status(404).render('error', { title: 'Comic Not Found', message: 'The comic does not exist.' });
    res.render('comic', { title: comic.story?.title || 'Comic', comic });
  } catch (error) {
    console.error('Error fetching comic:', error);
    res.status(500).render('error', { title: 'Error', message: 'An error occurred while loading the comic.' });
  }
});

// ---------------- Comic Generation ----------------

// Generate comic: create initial MongoDB record
app.post('/generate', async (req, res) => {
  const { topic, genre, panels, style } = req.body;
  if (!req.user) return res.redirect('/login');
  if (!topic) return res.render('index', { title: 'AI Comic Generator', error: 'Please enter a topic' });

  const comicId = Date.now().toString();

  try {
    await Comic.create({
      comicId,
      status: 'generating_story',
      progress: 0,
      currentStep: 'Starting...',
      createdBy: req.user._id
    });

    res.render('loading', { title: 'Generating Comic...', topic, genre, panels, style, comicId });

    // Generate in background
    generateComicInBackground(comicId, topic, genre, parseInt(panels), style, req.user._id);

  } catch (error) {
    console.error('Error starting comic generation:', error);
    res.render('index', { title: 'AI Comic Generator', error: 'Failed to start comic generation.' });
  }
});

// ---------------- Background Generation ----------------
async function generateComicInBackground(comicId, topic, genre, panels, style, userId) {
  try {
    // Step 0: Generating story
    await Comic.findOneAndUpdate({ comicId }, { status: 'generating_story', progress: 10, currentStep: 'Generating story...' });

    // Step 1: Generate story
    console.log(`🚀 Generating comic story for ID: ${comicId}`);
    const story = await generateComicStory(topic, genre, panels, style);
    if (!story) {
      await Comic.findOneAndUpdate({ comicId }, { status: 'error', error: 'Failed to generate story' });
      return;
    }

    await Comic.findOneAndUpdate({ comicId }, { status: 'generating_images', progress: 30, currentStep: 'Generating images...', story });

    // Step 2: Generate images
    console.log(`🎨 Generating images for comic ID: ${comicId}`);
    const images = await generateComicImages(story.scenes, style, genre, comicId);
    if (!images) {
      await Comic.findOneAndUpdate({ comicId }, { status: 'error', error: 'Failed to generate images' });
      return;
    }

    // Step 3: Complete comic
    await Comic.findOneAndUpdate({ comicId }, {
      status: 'completed',
      progress: 100,
      currentStep: 'Complete!',
      story,
      images,
      completedAt: new Date(),
      createdBy: userId
    });

    console.log(`✅ Comic generation completed for ID: ${comicId}`);

  } catch (error) {
    console.error(`❌ Error generating comic ${comicId}:`, error);
    await Comic.findOneAndUpdate({ comicId }, { status: 'error', error: error.message });
  }
}

// ---------------- Comic Story / Image Generation ----------------
async function generateComicStory(topic, genre, panels, style) {
  try {
    const prompt = `Create a ${panels}-panel comic story based on the topic: "${topic}" ...`; // your full prompt
    const result = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    throw new Error('No valid JSON found');
  } catch (error) {
    console.error('Error generating story:', error);
    return null;
  }
}

async function generateComicImages(scenes, style, genre, comicId) {
  try {
    const comicFolder = path.join(imagesDir, comicId);
    if (!fs.existsSync(comicFolder)) fs.mkdirSync(comicFolder, { recursive: true });

    const generatedPanels = [];
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      await Comic.findOneAndUpdate({ comicId }, { progress: 30 + (i / scenes.length) * 60, currentStep: `Generating Panel ${scene.panelNumber}...` });

      try {
        // Generate image prompt
        const promptResult = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: `Panel ${scene.panelNumber}: ...` });
        const imagePrompt = promptResult.text.trim();

        const imageResponse = await axios.post(
          'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
          { text_prompts: [{ text: imagePrompt, weight: 1 }], cfg_scale: 7, height: 1024, width: 1024, samples: 1, steps: 30 },
          { headers: { 'Authorization': `Bearer ${process.env.STABILITY_API_KEY}` } }
        );

        const imageData = imageResponse.data.artifacts[0].base64;
        const fileName = `panel_${scene.panelNumber.toString().padStart(2,'0')}.png`;
        const filePath = path.join(comicFolder, fileName);
        fs.writeFileSync(filePath, Buffer.from(imageData, 'base64'));

        generatedPanels.push({ panelNumber: scene.panelNumber, fileName, imagePath: `/generated/${comicId}/${fileName}`, dialogue: scene.dialogue, action: scene.action, setting: scene.setting });

      } catch (err) {
        console.error(`Error generating panel ${scene.panelNumber}:`, err);
        generatedPanels.push({ panelNumber: scene.panelNumber, error: 'Failed to generate', dialogue: scene.dialogue, action: scene.action });
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return { folder: comicFolder, panels: generatedPanels };

  } catch (err) {
    console.error('Error generating images:', err);
    return null;
  }
}

// ---------------- Start server ----------------
app.listen(PORT, () => {
  console.log(`🚀 Comic Generator running on http://localhost:${PORT}`);
});

module.exports = app;
