// src/Routes/AdminRoutes.js

import express from 'express';
import { protect, authorize } from '../Middlewares/AuthMiddleware.js';
import { 
    getAppAnalytics,
    getAllCommunities,
    getAllUsers,
    updateUserDetails,
    getCommunityDiscussions,
    deletePost,
    editPost,
    resolveReports,
    reportPostByAdmin,
    getRecentActivityFeed
} from '../Controllers/adminController.js';

const router = express.Router();

router.use(protect);

// 1. Analytics
router.get('/analytics', getAppAnalytics);
router.get('/activity-feed', getRecentActivityFeed);

// 2. Community Management
router.get('/communities', getAllCommunities);
router.get('/communities/:communityId/posts', getCommunityDiscussions);

// 3. User Management
router.get('/users', getAllUsers);
router.patch('/users/:userId', updateUserDetails);


router.delete('/posts/:postId', deletePost);
router.put('/posts/:postId/edit', editPost); 
router.put('/posts/:postId/report', reportPostByAdmin); 
router.put('/posts/:postId/reports/resolve',  resolveReports);

export default router;