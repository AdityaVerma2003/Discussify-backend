
import Post from '../Models/Post.js';
import Notification from '../Models/Notification.js';
import Community from '../Models/Community.js'; 
import path from 'path';

// Helper to get io instance
const getIo = (req) => req.app.get('io');
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001'; // Used for file paths

/**
 * Helper function to create post notification
 */
const notifyCommunityMembers = async (post, communityId, authorId, authorUsername) => {
    try {
        const community = await Community.findById(communityId).select('members name');
        if (!community) return;

        // Get all member IDs excluding the author
        const memberIds = community.members
            .filter(member => member.user.toString() !== authorId.toString())
            .map(member => member.user);

        const notifications = memberIds.map(memberId => ({
            user: memberId,
            title: `New Post in ${community.name}`,
            message: `${authorUsername} posted: ${post.content.substring(0, 50)}...`,
            type: 'post',
            data: { communityId: communityId, postId: post._id }
        }));

        await Notification.insertMany(notifications);
        console.log(`✅ Sent ${notifications.length} post notifications.`);
    } catch (error) {
        console.error('Error creating post notifications:', error);
    }
};

/**
 * @desc Create a new post (text or with file)
 * @route POST /api/v1/posts
 * @access Private
 */
export const createPost = async (req, res) => {
    try {
        let { content, communityId, title } = req.body;
        const author = req.user._id;

        // Validation
        if (!content || !communityId) {
            return res.status(400).json({ success: false, message: 'Content and community ID are required.' });
        }

        let newPostData = {
            content,
            community: communityId,
            author,
            title: title || content.substring(0, 50),
            type: 'text'
        };

        // Handle file upload
        if (req.file) {
            const filePath = `${API_BASE_URL}/uploads/${req.file.filename}`;
            const fileExtension = path.extname(req.file.originalname).toLowerCase();

            if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(fileExtension)) {
                newPostData.type = 'image';
                newPostData.images = [filePath];
            } else if (['.mp4', '.mov', '.webm'].includes(fileExtension)) {
                newPostData.type = 'video';
                newPostData.videoUrl = filePath;
            } else {
                // Treat other file types as generic files (if supported by multer config)
                // For this example, we assume multer only allows images as per your middleware
                // If you expand multer, adjust this logic.
                newPostData.type = 'image';
                newPostData.images = [filePath];
            }
        }

        const newPost = await Post.create(newPostData);

        // Populate author/community data before sending
        const populatedPost = await Post.findById(newPost._id)
            .populate('author', 'username profileImage')
            .lean();

        // 1. Emit Socket Event (Real-time update)
        getIo(req).to(communityId).emit('newPost', populatedPost);

        // 2. Create Notifications (Asynchronous)
        notifyCommunityMembers(newPost, communityId, req.user._id, req.user.username);
        
        res.status(201).json({ success: true, post: populatedPost });

    } catch (error) {
        console.error('Error creating post:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to create post.' });
    }
};

/**
 * @desc Get all posts for a community
 * @route GET /api/v1/posts/community/:communityId
 * @access Private
 */
export const getCommunityPosts = async (req, res) => {
    try {
        const { communityId } = req.params;
        const { page = 1, limit = 20 } = req.query;

        const posts = await Post.find({ community: communityId, isDeleted: false })
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((page - 1) * limit)
            .populate('author', 'username profileImage')
            .lean(); // Use lean for faster queries

        const total = await Post.countDocuments({ community: communityId, isDeleted: false });

        res.status(200).json({
            success: true,
            posts,
            pagination: {
                total,
                page: parseInt(page),
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message || 'Failed to fetch posts.' });
    }
};

/**
 * @desc Toggle upvote/like on a post
 * @route PUT /api/v1/posts/:postId/vote
 * @access Private
 */
export const togglePostVote = async (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.user._id;

        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ success: false, message: 'Post not found.' });
        }

        // Use the instance method defined in the schema
        await post.upvote(userId);
        
        // Populate author/community data before sending
        const populatedPost = await Post.findById(post._id)
            .populate('author', 'username profileImage')
            .lean();

        // Emit Socket Event (Real-time update)
        getIo(req).to(post.community.toString()).emit('postUpdated', populatedPost);

        res.status(200).json({ success: true, post: populatedPost, message: 'Vote updated successfully.' });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message || 'Failed to toggle vote.' });
    }
};