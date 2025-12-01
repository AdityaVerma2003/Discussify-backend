import express from 'express';
import { protect } from '../Middlewares/AuthMiddleware.js'; // Assuming the provided auth middleware path
import { upload } from '../Middlewares/upload.js'; // Assuming the provided upload middleware pat
import {
    getUserCommunities,
    getPopularCommunities,
    getRecommendedCommunities,
    createCommunity,
    getCommunityInformation,
    getAllDiscussionsInCommunity,
    joinCommunity, 
    inviteMember,
    getDiscoverableCommunities,
    leaveCommunity
} from '../Controllers/communityController.js'; // Assuming the controller path

const communityRouter = express.Router();

// ---------------------- Public Routes ----------------------

// GET /api/v1/communities/popular
// Get newest communities
// GET /api/v1/communities/my-communities

// Get communities the currently logged-in user is a member of
communityRouter.get('/my-communities', protect, getUserCommunities);
// GET /api/v1/communities/recommended
// Get communities recommended based on user interests
communityRouter.get('/recommended', protect, getRecommendedCommunities);

communityRouter.get('/popular', getPopularCommunities);
communityRouter.get('/discover/:userId', getDiscoverableCommunities);

// GET /api/v1/communities/:idOrSlug
// Get detailed information about a single community
communityRouter.get('/:idOrSlug', getCommunityInformation);

// GET /api/v1/communities/:idOrSlug/discussions
// Get all discussions/posts within a community

communityRouter.post('/:idOrSlug/invite', protect, inviteMember);

// Note: Visibility/Membership check is handled inside the controller
communityRouter.get('/:idOrSlug/discussions', protect, getAllDiscussionsInCommunity);


// ---------------------- Protected Routes ----------------------




// POST /api/v1/communities/create
// Create a new community (Requires 'coverImage' as the field name for file upload)
communityRouter.post(
    '/create', 
    protect, 
    upload.single('coverImage'), 
    createCommunity
);

// POST /api/v1/communities/:idOrSlug/join
// Allows a logged-in user to join a community
communityRouter.post(
    '/:idOrSlug/join',
    protect,
    joinCommunity
);

communityRouter.post(
    '/:idOrSlug/leave',
    protect,
    leaveCommunity
);


export default communityRouter;