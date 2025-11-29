// src/Routes/postRoutes.js (NEW)

import express from 'express';
import { protect } from '../Middlewares/AuthMiddleware.js' // Ensure correct path
import { upload } from '../Middlewares/upload.js'; // Ensure correct path

import {
    createPost,
    getCommunityPosts,
    togglePostVote // Placeholder for future comment functionality
} from '../Controllers/postController.js'; 

const postRouter = express.Router();

// All post routes require authentication
postRouter.use(protect);

// GET /api/v1/posts/community/:communityId - Get all posts in a community
postRouter.get('/community/:communityId', getCommunityPosts);

// POST /api/v1/posts - Create a new post (handles file upload)
postRouter.post(
    '/',
    upload.single('file'), // Use 'file' as the field name for file upload
    createPost
);

// PUT /api/v1/posts/:postId/vote - Toggle like/upvote
postRouter.put('/:postId/vote', togglePostVote); 

// POST /api/v1/posts/:postId/reply - Create a reply/comment (placeholder)
// router.post('/:postId/reply', replyToPost); 

export default postRouter;