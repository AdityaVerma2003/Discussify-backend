import Community from '../models/Community.js';
import mongoose from 'mongoose';
import UserModel from '../Models/UserModel.js';


const Post = {
    find: (query) => ({
        sort: () => ({
            limit: () => ([{ title: "Mock Discussion", community: query.communityId || query.communitySlug }])
        })
    })
};


// **Updated Helper function** to execute a query (by ID, then by Slug) and apply Mongoose query options.
const findCommunity = async (idOrSlug, populateOptions = null, selectOptions = null) => {
    
    // Helper to build and execute a query with population/selection options
    const executeQuery = (condition) => {
        let query = Community.findOne(condition);
        if (populateOptions) query.populate(populateOptions);
        if (selectOptions) query.select(selectOptions);
        return query.exec();
    };

    let community = null;
    const isObjectId = mongoose.Types.ObjectId.isValid(idOrSlug);

    // Attempt 1: Search by ID if the input looks like an ObjectId
    if (isObjectId) {
        community = await executeQuery({ _id: idOrSlug });
    }

    // Attempt 2: If the first attempt failed, or the input was not a valid ObjectId, search by slug
    if (!community) {
        community = await executeQuery({ slug: idOrSlug });
    }
    
    return community;
};


// @desc    Get communities the user is a member of
// @route   GET /api/v1/communities/my-communities
// @access  Private (protect)
const getUserCommunities = async (req, res) => {
    try {
        const userId = req.user._id;
        
        // Find communities where the user's ID is in the members array
        const communities = await Community.find({
            'members.user': userId,
            isActive: true,
            visibility: { $ne: 'hidden' }
        })
        .select('-bannedUsers -rules') // Exclude sensitive fields
        .populate({
            path: 'admin',
            select: 'username avatar'
        });


        if (!communities || communities.length === 0) {
            // Returns 200 with empty array if no communities joined (NOT a 404)
            return res.status(200).json({
                success: true,
                message: 'You have not joined any communities yet.',
                data: []
            });
        }

        res.status(200).json({
            success: true,
            count: communities.length,
            data: communities
        });

    } catch (error) {
        // Log the error for this specific route
        console.error('Error fetching user communities:', error);
        res.status(500).json({ success: false, message: 'Server error fetching user communities.' });
    }
};

// @desc    Get newly created communities (popular by newness)
// @route   GET /api/v1/communities/popular
// @access  Public
const getPopularCommunities = async (req, res) => {
    try {
        // 'Popular' is defined as 'newly created', so sort by creation date (descending)
        const limit = parseInt(req.query.limit) || 10;

        const popularCommunities = await Community.find({
            isActive: true,
            visibility: 'public'
        })
        .sort({ createdAt: -1 }) // Sort by newest first
        .limit(limit)
        .select('-bannedUsers -rules -members') // Exclude sensitive/large fields
        .populate({
            path: 'admin',
            select: 'username avatar'
        });

        res.status(200).json({
            success: true,
            count: popularCommunities.length,
            data: popularCommunities
        });

    } catch (error) {
        console.error('Error fetching popular communities:', error);
        res.status(500).json({ success: false, message: 'Server error fetching popular communities.' });
    }
};

// @desc    Get recommended communities based on user interests
// @route   GET /api/v1/communities/recommended
// @access  Private (protect)
const getRecommendedCommunities = async (req, res) => {
    try {
        const userId = req.user._id;
        // In a real scenario, req.user would already contain interests from the auth middleware lookup.
        const user = req.user; 
        const userInterests = user.interests || [];
        console.log('User Interests:', userInterests);

        if (userInterests.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No interests found. Please update your profile to get recommendations.',
                data: []
            });
        }

        const communities = await Community.find({
            // FIX: Use $in to match communities that share ANY of the user's interests.
            categories: { $in: userInterests },
            // Ensure the user is NOT already a member
            'members.user': { $ne: userId }, 
            isActive: true,
            visibility: 'public'
        })
        .limit(10)
        .sort({ memberCount: -1 }) // Recommend more active communities
        .select('-bannedUsers -rules -members')
        .populate({
            path: 'admin',
            select: 'username avatar'
        });
        
        res.status(200).json({
            success: true,
            count: communities.length,
            data: communities
        });

    } catch (error) {
        console.error('Error fetching recommended communities:', error);
        res.status(500).json({ success: false, message: 'Server error fetching recommended communities.' });
    }
};

// @desc    Create a new community
// @route   POST /api/v1/communities/create
// @access  Private (protect)
const createCommunity = async (req, res) => {
    try {
        const { name, description, categories } = req.body;
        const userId = req.user._id;
        
        // 1. Basic Validation
        if (!name || !description || !categories) {
            return res.status(400).json({
                success: false,
                message: 'Please provide name, description, and categories.'
            });
        }
        
        // Ensure categories is an array
        const categoryArray = Array.isArray(categories) ? categories : [categories];
        
        // 2. File Upload Path (from middleware)
        let coverImage = null;
        if (req.file) {
            // Store the path relative to the server root (e.g., /uploads/filename.jpg)
            coverImage = `/uploads/${req.file.filename}`;
        }

        // 3. Create Community
        const newCommunity = await Community.create({
            name,
            description,
            categories: categoryArray,
            coverImage,
            admin: userId,
            // Automatically make the creator the first member (as an admin)
            members: [{ user: userId, role: 'admin' }], 
            memberCount: 1, // Initialize member count
        });
        
        // 4. Update User's profile to include the new community in joinedCommunities
        // Since the creator is automatically a member, they must be added to their own profile's list.
        await UserModel.findByIdAndUpdate(userId, {
            $addToSet: { joinedCommunities: newCommunity._id }
        }, { new: true });


        res.status(201).json({
            success: true,
            message: 'Community created successfully.',
            data: newCommunity
        });

    } catch (error) {
        console.error('Error creating community:', error);
        
        if (error.code === 11000) { // Duplicate key error (name/slug)
            return res.status(400).json({
                success: false,
                message: 'A community with this name already exists.'
            });
        }

        // Handle Mongoose validation errors
        if (error.name === 'ValidationError') {
            const message = Object.values(error.errors).map(val => val.message).join(', ');
            return res.status(400).json({ success: false, message: message });
        }

        res.status(500).json({ success: false, message: 'Server error during community creation.' });
    }
};

// @desc    Get detailed community information
// @route   GET /api/v1/communities/:idOrSlug
// @access  Public
const getCommunityInformation = async (req, res) => {
    try {
        const { idOrSlug } = req.params;
        
        // Pass options to the helper instead of chaining them outside.
        const community = await findCommunity(
            idOrSlug,
            { path: 'admin', select: 'username avatar email' }, // populateOptions
            '-bannedUsers' // selectOptions
        );

        if (!community) {
            return res.status(404).json({ success: false, message: 'Community not found.' });
        }

        // Basic visibility check (can be expanded with full authorization)
        if (community.visibility === 'private' && 
            (!req.user || !community.isMember(req.user._id))
        ) {
            return res.status(403).json({ success: false, message: 'This community is private.' });
        }

        res.status(200).json({
            success: true,
            data: community
        });

    } catch (error) {
        console.error('Error fetching community information:', error);
        res.status(500).json({ success: false, message: 'Server error fetching community information.' });
    }
};

// @desc    Get all discussions/posts inside a community
// @route   GET /api/v1/communities/:idOrSlug/discussions
// @access  Public (Visibility checks should be done here)
const getAllDiscussionsInCommunity = async (req, res) => {
    try {
        const { idOrSlug } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const community = await findCommunity(idOrSlug);

        if (!community) {
            return res.status(404).json({ success: false, message: 'Community not found.' });
        }

        // Visibility check (simplified)
        if (community.visibility === 'private' && 
            (!req.user || !community.isMember(req.user._id))
        ) {
            return res.status(403).json({ success: false, message: 'Access denied. Join the community to see discussions.' });
        }

        // --- Mock Fetching Discussions (Assuming a Post/Discussion model) ---
        // Find all posts associated with this community ID
        const posts = await Post.find({ community: community._id })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
        
        // In a real application, you would also fetch the total count for pagination

        res.status(200).json({
            success: true,
            community: { _id: community._id, name: community.name, slug: community.slug },
            page,
            limit,
            data: posts
        });

    } catch (error) {
        console.error('Error fetching community discussions:', error);
        res.status(500).json({ success: false, message: 'Server error fetching discussions.' });
    }
};

// @desc    Allows a user to join a community
// @route   POST /api/v1/communities/:idOrSlug/join
// @access  Private (protect)
const joinCommunity = async (req, res) => {
    try {
        const { idOrSlug } = req.params;
        // User ID is available from the protect middleware
        const userId = req.user._id;

        const community = await findCommunity(idOrSlug);

        if (!community) {
            return res.status(404).json({ success: false, message: 'Community not found.' });
        }

        // Check if user is banned
        if (community.isBanned(userId)) {
            return res.status(403).json({ success: false, message: 'You are banned from joining this community.' });
        }

        // Check if user is already a member
        if (community.isMember(userId)) {
            return res.status(400).json({ success: false, message: 'You are already a member of this community.' });
        }

        // Handle private community request
        if (community.visibility === 'private') {
            // For private communities, we block direct join. 
            // A more complex app would save this as a pending request.
            return res.status(403).json({ 
                success: false, 
                message: 'This is a private community. Membership requires admin approval or a separate request process.' 
            });
        }
        
        // 1. Add user to community's member list and update memberCount
        await community.addMember(userId);

        // 2. Update User's joinedCommunities array (MANDATORY UPDATE)
        // Use $addToSet to add the community ID, ensuring no duplicates.
        await UserModel.findByIdAndUpdate(userId, {
            $addToSet: { joinedCommunities: community._id }
        }, { new: true });
        
        res.status(200).json({
            success: true,
            message: `Successfully joined community: ${community.name}`,
            data: {
                _id: community._id,
                slug: community.slug,
                memberCount: community.memberCount
            }
        });

    } catch (error) {
        console.error('Error joining community:', error);
        // Catch the explicit error from addMember if it somehow gets bypassed
        if (error.message === 'User is already a member') {
             return res.status(400).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: 'Server error while joining community.' });
    }
};


export {
    getUserCommunities,
    getPopularCommunities,
    getRecommendedCommunities,
    createCommunity,
    getCommunityInformation,
    getAllDiscussionsInCommunity,
    joinCommunity, 
};