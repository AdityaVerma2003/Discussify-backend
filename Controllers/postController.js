
import Post from '../Models/Post.js';
import Notification from '../Models/Notification.js';
import Community from '../Models/Community.js'; 
import path from 'path';
import Comment from '../Models/Comment.js';

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
        let { content, communityId } = req.body;
        const author = req.user._id;

        // Validation
        if (!content || !communityId) {
            return res.status(400).json({ success: false, message: 'Content and community ID are required.' });
        }

        let newPostData = {
            content,
            community: communityId,
            author,
            type: 'text'
        };

        // Handle multiple file uploads
        if (req.files && req.files.length > 0) {
            const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
            const videoExtensions = ['.mp4', '.mov', '.webm'];
            
            const images = [];
            const videos = [];

            // Process each uploaded file
            req.files.forEach(file => {
                const filePath = `${API_BASE_URL}/uploads/${file.filename}`;
                const fileExtension = path.extname(file.originalname).toLowerCase();

                if (imageExtensions.includes(fileExtension)) {
                    images.push(filePath);
                } else if (videoExtensions.includes(fileExtension)) {
                    videos.push(filePath);
                }
            });

            // Determine post type based on uploaded files
            if (images.length > 0 && videos.length === 0) {
                newPostData.type = 'image';
                newPostData.images = images;
            } else if (videos.length > 0 && images.length === 0) {
                newPostData.type = 'video';
                newPostData.videoUrl = videos[0]; // Use first video
                // If you want to support multiple videos, adjust your schema
            } else if (images.length > 0 && videos.length > 0) {
                // Mixed media - prioritize images or handle both
                newPostData.type = 'image';
                newPostData.images = images;
                // Optionally store video URL as well if schema supports it
            }
        } 
        // Handle single file upload (backward compatibility)
        else if (req.file) {
            const filePath = `${API_BASE_URL}/uploads/${req.file.filename}`;
            const fileExtension = path.extname(req.file.originalname).toLowerCase();

            if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(fileExtension)) {
                newPostData.type = 'image';
                newPostData.images = [filePath];
            } else if (['.mp4', '.mov', '.webm'].includes(fileExtension)) {
                newPostData.type = 'video';
                newPostData.videoUrl = filePath;
            } else {
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



/**
 * @desc Create a new comment/reply on a post
 * @route POST /api/v1/posts/:postId/comment
 * @access Private
 */
export const replyToPost = async (req, res) => {
    try {
        const { postId } = req.params;
        const { content } = req.body; // You can add parentCommentId for nesting later

        const author = req.user._id;

        if (!content) {
            return res.status(400).json({ success: false, message: 'Comment content is required.' });
        }

        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ success: false, message: 'Post not found.' });
        }

        const communityId = post.community;

        // 1. Create the new Comment
        const newComment = await Comment.create({
            content,
            post: postId,
            author,
            community: communityId,
            // For now, parentComment and replyToPost are the same as the main post
            replyToPost: postId
        });

        // 2. Increment comment count on the Post
        post.commentCount += 1;
        await post.save();

        // 3. Populate and prepare the comment for real-time delivery
        const populatedComment = await Comment.findById(newComment._id)
            .populate('author', 'username profileImage')
            .lean();
            
        // 4. Emit Socket Event to the community (Real-time update)
        // You might want a dedicated 'newComment' event, but for a simple reply system,
        // you can also update the entire post object (commentCount changed).
        
        const updatedPost = await Post.findById(postId)
            .populate('author', 'username profileImage')
            .lean();
            
        getIo(req).to(communityId.toString()).emit('postUpdated', updatedPost);

        // 5. Send success response with the new comment
        res.status(201).json({ 
            success: true, 
            comment: populatedComment,
            message: 'Comment created successfully. Post comment count updated.'
        });

    } catch (error) {
        console.error('Error creating comment:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to create comment.' });
    }
};