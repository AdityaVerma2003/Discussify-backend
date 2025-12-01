// src/index.js (REWRITTEN)

import express from 'express';
import http from 'http'; // Import http
import { Server } from 'socket.io'; // Import Socket.io Server
import cors from 'cors';
import { UPLOADS_DIR } from './config.js'; // Ensure UPLOADS_DIR is defined
import authRouter from './Routes/AuthRoutes.js';
import notificationRouter from './Routes/notificationRoutes.js';
import communityRouter from './Routes/communityRoutes.js';
import postRouter from './Routes/postRoutes.js'; // NEW: Import Post Routes
import { handleMulterError } from './Middlewares/upload.js';
import connectDB from './DB/connectDB.js';
import dotenv from 'dotenv';
import adminRouter from './Routes/adminRoutes.js';

dotenv.config();

const app = express();
const server = http.createServer(app); // Create HTTP server
const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_URL || "http://localhost:3000", // Allow your frontend URL
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    }
});

// Attach io to the Express app for use in controllers
app.set('io', io);

connectDB();

// Middleware setup
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the uploaded files statically
app.use('/uploads', express.static(UPLOADS_DIR));

// Socket.io Connection Logic
io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Join a community room for real-time updates
    socket.on('joinCommunity', (communityId) => {
        socket.join(communityId);
        console.log(`Socket ${socket.id} joined room: ${communityId}`);
    });

    // Leave a community room
    socket.on('leaveCommunity', (communityId) => {
        socket.leave(communityId);
        console.log(`Socket ${socket.id} left room: ${communityId}`);
    });

    socket.on('disconnect', () => {
        console.log(`Socket disconnected: ${socket.id}`);
    });
});

// Mount routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/notifications', notificationRouter);
app.use('/api/v1/communities', communityRouter);
app.use('/api/v1/posts', postRouter); 
app.use('/api/v1/admin', adminRouter);

// Multer error handler (MUST be after routes)
app.use(handleMulterError);

// Global Error Handler for unhandled routes
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        message: `Can't find ${req.originalUrl} on this server!`
    });
});

// General error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Something went wrong!'
    });
});

const PORT = process.env.PORT || 3001;

// Use server.listen instead of app.listen
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});