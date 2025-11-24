import express from 'express';
import cors from 'cors';
import { UPLOADS_DIR } from './config.js';
import authRouter from './Routes/AuthRoutes.js';
import notificationRouter from './Routes/notificationRoutes.js';
import { handleMulterError } from './Middlewares/upload.js';
import connectDB from './DB/connectDB.js';
import dotenv from 'dotenv';
import communityRouter from './Routes/communityRoutes.js';

dotenv.config();

const app = express();

connectDB();

// Middleware setup
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the uploaded images statically
app.use('/uploads', express.static(UPLOADS_DIR));

// Mount routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/notifications', notificationRouter);
app.use('/api/v1/communities', communityRouter);

// Multer error handler (MUST be after routes)
app.use(handleMulterError);

// Global Error Handler for unhandled routes
app.use((req, res, next) => {
    res.status(404).json({
        status: 'fail',
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

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});