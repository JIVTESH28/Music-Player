const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    console.log('📁 Creating data directory...');
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('✅ Data directory created successfully');
}

// Initialize music.json if it doesn't exist
const musicJsonPath = path.join(__dirname, 'data', 'music.json');
if (!fs.existsSync(musicJsonPath)) {
    console.log('📄 Creating music.json file...');
    fs.writeFileSync(musicJsonPath, JSON.stringify({ tracks: [] }, null, 2));
    console.log('✅ music.json file created successfully');
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, dataDir);
    },
    filename: function (req, file, cb) {
        const uniqueId = uuidv4();
        const ext = path.extname(file.originalname);
        cb(null, uniqueId + ext);
    }
});

// Filter to accept only audio files
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
        cb(null, true);
    } else {
        console.log(`❌ Rejected file: ${file.originalname} (not an audio file)`);
        cb(new Error('Only audio files are allowed!'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/data', express.static(path.join(__dirname, 'data')));
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${new Date().toISOString()} | ${req.method} ${req.originalUrl} | ${res.statusCode} | ${duration}ms`);
    });
    next();
});

// API to get all music
app.get('/api/music', (req, res) => {
    try {
        console.log('📋 Fetching music library...');
        const musicData = JSON.parse(fs.readFileSync(musicJsonPath));
        console.log(`✅ Retrieved ${musicData.tracks.length} tracks from library`);
        res.json(musicData);
    } catch (error) {
        console.error('❌ Error reading music data:', error);
        res.status(500).json({ error: 'Failed to read music data' });
    }
});

// Upload music files
app.post('/api/music/upload', upload.array('musicFiles', 10), (req, res) => {
    try {
        console.log('📤 Processing music upload request...');
        const musicData = JSON.parse(fs.readFileSync(musicJsonPath));
        const uploadedFiles = req.files;
        
        if (!uploadedFiles || uploadedFiles.length === 0) {
            console.log('❌ Upload failed: No files uploaded');
            return res.status(400).json({ error: 'No files uploaded' });
        }

        console.log(`📥 Received ${uploadedFiles.length} files for upload`);
        
        const newTracks = uploadedFiles.map(file => {
            // Extract name and artist from filename
            let name = file.originalname.replace(/\.[^/.]+$/, ""); 
            let artist = 'Unknown Artist';
            
            // Try to parse artist - title format
            const parts = name.split(' - ');
            if (parts.length > 1) {
                artist = parts[0];
                name = parts.slice(1).join(' - ');
            }

            console.log(`🎵 Processing: "${name}" by ${artist} (${file.filename})`);

            return {
                id: path.basename(file.filename, path.extname(file.filename)),
                name: name,
                artist: artist,
                filename: file.filename,
                path: `/data/${file.filename}`,
                mimetype: file.mimetype,
                size: file.size,
                dateAdded: new Date().toISOString()
            };
        });

        // Add new tracks to the existing list
        const previousCount = musicData.tracks.length;
        musicData.tracks = [...musicData.tracks, ...newTracks];
        
        // Save updated music data
        fs.writeFileSync(musicJsonPath, JSON.stringify(musicData, null, 2));
        console.log(`✅ Library updated: ${previousCount} → ${musicData.tracks.length} tracks`);
        
        res.status(201).json({ 
            message: 'Files uploaded successfully',
            tracks: newTracks
        });
    } catch (error) {
        console.error('❌ Error uploading files:', error);
        res.status(500).json({ error: 'Failed to upload files' });
    }
});

// Delete a track
app.delete('/api/music/:id', (req, res) => {
    try {
        const { id } = req.params;
        console.log(`🗑️ Deleting track with ID: ${id}`);
        
        const musicData = JSON.parse(fs.readFileSync(musicJsonPath));
        const previousCount = musicData.tracks.length;
        
        // Find the track to delete
        const trackToDelete = musicData.tracks.find(track => track.id === id);
        
        if (!trackToDelete) {
            console.log(`❌ Delete failed: Track with ID ${id} not found`);
            return res.status(404).json({ error: 'Track not found' });
        }
        
        console.log(`📄 Found track: "${trackToDelete.name}" by ${trackToDelete.artist}`);
        
        // Delete the file from the filesystem
        const filePath = path.join(__dirname, 'data', trackToDelete.filename);
        if (fs.existsSync(filePath)) {
            console.log(`🗑️ Deleting file: ${trackToDelete.filename}`);
            fs.unlinkSync(filePath);
            console.log(`✅ File deleted successfully`);
        } else {
            console.log(`⚠️ File not found: ${trackToDelete.filename}`);
        }
        
        // Remove the track from the array
        musicData.tracks = musicData.tracks.filter(track => track.id !== id);
        
        // Save updated music data
        fs.writeFileSync(musicJsonPath, JSON.stringify(musicData, null, 2));
        console.log(`✅ Track removed from library: ${previousCount} → ${musicData.tracks.length} tracks`);
        
        res.json({ 
            message: 'Track deleted successfully',
            id: id,
            trackName: trackToDelete.name,
            artist: trackToDelete.artist
        });
    } catch (error) {
        console.error('❌ Error deleting track:', error);
        res.status(500).json({ error: 'Failed to delete track' });
    }
});

// Simple health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        musicCount: JSON.parse(fs.readFileSync(musicJsonPath)).tracks.length
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`
    🎵 Music Player Server 🎵
    ===========================
    🚀 Server started at: ${new Date().toISOString()}
    🔌 Port: ${PORT}
    📂 Data directory: ${dataDir}
    🌐 URL: http://localhost:${PORT}
    ===========================
    `);
});