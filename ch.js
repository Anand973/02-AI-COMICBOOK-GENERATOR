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

// Initialize Gemini AI
const ai = new GoogleGenAI({});

// Ensure directories exist
const publicDir = path.join(__dirname, 'public');
const viewsDir = path.join(__dirname, 'views');
const imagesDir = path.join(__dirname, 'public', 'generated');

[publicDir, viewsDir, imagesDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

connectDB().then(() => {
  console.log("🚀 Connected to MongoDB")
}).catch((err) => {
  console.error("❌ Failed to connect to MongoDB:", err)
});

// Set up EJS
app.set('view engine', 'ejs');
app.set('views', viewsDir);

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use('/user', StaticRoute);

// parse cookies so we can read the uid token (if present)
app.use(cookieParser());

// populate req.user and res.locals.user for all views if a valid uid cookie exists
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
  } catch (err) {
    // ignore - leave req.user undefined if token invalid
  }
  next();
});

// Routes
app.get('/', (req, res) => {
  res.render('home', { user: req.user });
});

app.get('/create', (req, res) => {
  res.render('index', { title: 'AI Comic Generator' });
});

app.get('/gallery', async (req, res) => {
  try {
    // Fetch all completed comics from MongoDB, sorted by newest first
    const comics = await Comic.find({ status: 'completed' })
      .sort({ createdAt: -1 })
      .lean();
    
    res.render('gallery', { title: 'Comic Gallery', comics });
  } catch (error) {
    console.error('Error fetching comics:', error);
    res.render('gallery', { 
      title: 'Comic Gallery', 
      comics: [],
      error: 'Failed to load comics'
    });
  }
});

app.get('/comic/:id', async (req, res) => {
  try {
    const comic = await Comic.findOne({ comicId: req.params.id }).lean();
    
    if (!comic) {
      return res.status(404).render('error', {
        title: 'Comic Not Found',
        message: 'The comic you are looking for does not exist.'
      });
    }
    
    res.render('comic', { title: comic.story?.title || 'Comic', comic });
  } catch (error) {
    console.error('Error fetching comic:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'An error occurred while loading the comic.'
    });
  }
});

// Main comic generation endpoint
app.post('/generate', async (req, res) => {
  const { topic, genre, panels, style } = req.body;

  if (!topic) {
    return res.render('index', {
      title: 'AI Comic Generator',
      error: 'Please enter a topic for your comic'
    });
  }

  const comicId = Date.now().toString();

  try {
    // Create initial comic record in MongoDB
    await Comic.create({
      comicId: comicId,
      status: 'generating_story',
      progress: 0,
      currentStep: 'Starting...',
      createdBy: req.user?._id || null
    });

    // Show loading page
    res.render('loading', {
      title: 'Generating Comic...',
      topic,
      genre,
      panels,
      style,
      comicId
    });

    // Generate in background
    generateComicInBackground(comicId, topic, genre, parseInt(panels), style);

  } catch (error) {
    console.error('Error starting comic generation:', error);
    res.render('index', {
      title: 'AI Comic Generator',
      error: 'Failed to start comic generation. Please try again.'
    });
  }
});

// Check generation status
app.get('/status/:id', async (req, res) => {
  try {
    const comic = await Comic.findOne({ comicId: req.params.id }).lean();

    if (!comic) {
      return res.json({ status: 'not_found' });
    }

    if (comic.status === 'completed') {
      return res.json({
        status: 'completed',
        redirect: `/comic/${req.params.id}`
      });
    }

    res.json({
      status: comic.status,
      progress: comic.progress || 0,
      currentStep: comic.currentStep || 'Starting...'
    });
  } catch (error) {
    console.error('Error checking status:', error);
    res.json({ status: 'error', error: 'Failed to check status' });
  }
});

// Background comic generation function
async function generateComicInBackground(comicId, topic, genre, panels, style) {
  try {
    // Update: Generating story
    await Comic.findOneAndUpdate(
      { comicId },
      {
        status: 'generating_story',
        progress: 10,
        currentStep: 'Generating story...'
      }
    );

    // Step 1: Generate story
    console.log(`🚀 Generating comic story for ID: ${comicId}`);
    const story = await generateComicStory(topic, genre, panels, style);

    if (!story) {
      await Comic.findOneAndUpdate(
        { comicId },
        {
          status: 'error',
          error: 'Failed to generate story'
        }
      );
      return;
    }

    // Update progress
    await Comic.findOneAndUpdate(
      { comicId },
      {
        status: 'generating_images',
        progress: 30,
        currentStep: 'Generating images...',
        story: story
      }
    );

    // Step 2: Generate images
    console.log(`🎨 Generating images for comic ID: ${comicId}`);
    const images = await generateComicImages(story.scenes, style, genre, comicId);

    if (!images) {
      await Comic.findOneAndUpdate(
        { comicId },
        {
          status: 'error',
          error: 'Failed to generate images'
        }
      );
      return;
    }

    // Complete
    await Comic.findOneAndUpdate(
      { comicId },
      {
        status: 'completed',
        progress: 100,
        currentStep: 'Complete!',
        images: images,
        completedAt: new Date()
      }
    );

    console.log(`✅ Comic generation completed for ID: ${comicId}`);

  } catch (error) {
    console.error(`❌ Error generating comic ${comicId}:`, error);
    await Comic.findOneAndUpdate(
      { comicId },
      {
        status: 'error',
        error: error.message
      }
    );
  }
}

// Comic story generation function
async function generateComicStory(topic, genre, panels, style) {
  try {
    const prompt = `
Create a ${panels}-panel comic story based on the topic: "${topic}"

Requirements:
- Genre: ${genre}
- Style: ${style}
- Panels: ${panels}

Please structure your response as a JSON object with the following format:

{
  "title": "Comic Title",
  "summary": "Brief story summary",
  "characters": [
    {
      "name": "Character Name",
      "description": "Character description",
      "role": "protagonist/antagonist/supporting"
    }
  ],
  "scenes": [
    {
      "panelNumber": 1,
      "setting": "Description of the scene location",
      "action": "What's happening in this panel",
      "dialogue": "Character dialogue (if any)",
      "characters": ["Character names in this scene"],
      "mood": "Panel mood/tone"
    }
  ]
}

Make sure the story has:
1. A clear beginning, middle, and end
2. Engaging dialogue that fits the genre
3. Visual scenes that work well in comic format
4. Character development appropriate for the panel count
5. A satisfying conclusion
`;

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const storyText = result.text;
    const jsonMatch = storyText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    throw new Error('No valid JSON found in response');

  } catch (error) {
    console.error('Error generating story:', error);
    return null;
  }
}

// Comic images generation function
async function generateComicImages(scenes, style, genre, comicId) {
  try {
    const comicFolder = path.join(imagesDir, comicId);
    if (!fs.existsSync(comicFolder)) {
      fs.mkdirSync(comicFolder, { recursive: true });
    }

    const generatedPanels = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];

      // Update progress in MongoDB
      await Comic.findOneAndUpdate(
        { comicId },
        {
          progress: 30 + (i / scenes.length) * 60,
          currentStep: `Generating Panel ${scene.panelNumber}...`
        }
      );

      try {
        // Generate prompt
        const promptResult = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `
Create a detailed image prompt optimized for Stability AI:

Panel ${scene.panelNumber}:
- Setting: ${scene.setting}
- Action: ${scene.action}
- Characters: ${scene.characters ? scene.characters.join(', ') : 'None specified'}
- Mood: ${scene.mood}

Style: ${style} comic book style
Genre: ${genre}

Generate a single paragraph prompt with art style, character details, background, composition, lighting, and quality tags like "high quality", "detailed", "comic book art", "${style} style".
`
        });

        const imagePrompt = promptResult.text.trim();

        // Generate image with Stability AI
        const imageResponse = await axios.post(
          'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
          {
            text_prompts: [{ text: imagePrompt, weight: 1 }],
            cfg_scale: 7,
            height: 1024,
            width: 1024,
            samples: 1,
            steps: 30
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Authorization': `Bearer ${process.env.STABILITY_API_KEY}`
            }
          }
        );

        // Save image
        const imageData = imageResponse.data.artifacts[0].base64;
        const fileName = `panel_${scene.panelNumber.toString().padStart(2, '0')}.png`;
        const filePath = path.join(comicFolder, fileName);

        const imageBuffer = Buffer.from(imageData, 'base64');
        fs.writeFileSync(filePath, imageBuffer);

        generatedPanels.push({
          panelNumber: scene.panelNumber,
          fileName: fileName,
          imagePath: `/generated/${comicId}/${fileName}`,
          dialogue: scene.dialogue,
          action: scene.action,
          setting: scene.setting
        });

      } catch (error) {
        console.error(`Error generating panel ${scene.panelNumber}:`, error);
        generatedPanels.push({
          panelNumber: scene.panelNumber,
          error: 'Failed to generate',
          dialogue: scene.dialogue,
          action: scene.action
        });
      }

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return {
      folder: comicFolder,
      panels: generatedPanels
    };

  } catch (error) {
    console.error('Error generating images:', error);
    return null;
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Comic Generator running on http://localhost:${PORT}`);
  console.log(`📝 Make sure your .env file contains:`);
  console.log(`   GEMINI_API_KEY=your_key`);
  console.log(`   STABILITY_API_KEY=your_key`);
  console.log(`   MONGODB_URI=your_mongodb_connection_string`);
});

module.exports = app;