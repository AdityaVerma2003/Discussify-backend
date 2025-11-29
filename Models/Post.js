import mongoose from 'mongoose';

const postSchema = new mongoose.Schema({
  content: {
    type: String,
    required: [true, 'Post content is required'],
    maxlength: [10000, 'Content cannot exceed 10000 characters']
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  community: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Community',
    required: true
  },
  type: {
    type: String,
    enum: ['text', 'image', 'video', 'link', 'poll'],
    default: 'text'
  },
  images: [{
    type: String
  }],
  videoUrl: {
    type: String
  },
  linkUrl: {
    type: String
  },
  linkPreview: {
    title: String,
    description: String,
    image: String
  },
  poll: {
    question: String,
    options: [{
      text: String,
      votes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }]
    }],
    expiresAt: Date,
    allowMultipleVotes: {
      type: Boolean,
      default: false
    }
  },
  tags: [{
    type: String,
    trim: true
  }],
  upvotes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  downvotes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  voteCount: {
    type: Number,
    default: 0
  },
  commentCount: {
    type: Number,
    default: 0
  },
  viewCount: {
    type: Number,
    default: 0
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  isLocked: {
    type: Boolean,
    default: false
  },
  isApproved: {
    type: Boolean,
    default: true
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  },
  editedAt: {
    type: Date
  },
  reports: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: String,
    reportedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Calculate vote count
postSchema.methods.updateVoteCount = function() {
  this.voteCount = this.upvotes.length - this.downvotes.length;
};

// Upvote post
postSchema.methods.upvote = async function(userId) {
  const userIdStr = userId.toString();
  
  // Remove from downvotes if exists
  this.downvotes = this.downvotes.filter(id => id.toString() !== userIdStr);
  
  // Toggle upvote
  const upvoteIndex = this.upvotes.findIndex(id => id.toString() === userIdStr);
  if (upvoteIndex > -1) {
    this.upvotes.splice(upvoteIndex, 1);
  } else {
    this.upvotes.push(userId);
  }
  
  this.updateVoteCount();
  await this.save();
};

// Downvote post
postSchema.methods.downvote = async function(userId) {
  const userIdStr = userId.toString();
  
  // Remove from upvotes if exists
  this.upvotes = this.upvotes.filter(id => id.toString() !== userIdStr);
  
  // Toggle downvote
  const downvoteIndex = this.downvotes.findIndex(id => id.toString() === userIdStr);
  if (downvoteIndex > -1) {
    this.downvotes.splice(downvoteIndex, 1);
  } else {
    this.downvotes.push(userId);
  }
  
  this.updateVoteCount();
  await this.save();
};

// Increment view count
postSchema.methods.incrementViews = async function() {
  this.viewCount += 1;
  await this.save();
};

// Soft delete
postSchema.methods.softDelete = async function() {
  this.isDeleted = true;
  this.deletedAt = Date.now();
  await this.save();
};

// Indexes for better performance
postSchema.index({ community: 1, createdAt: -1 });
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ tags: 1 });
postSchema.index({ voteCount: -1 });
postSchema.index({ isDeleted: 1, isApproved: 1 });

export default mongoose.model('Post', postSchema);