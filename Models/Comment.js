import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema({
  content: {
    type: String,
    required: [true, 'Comment content is required'],
    maxlength: [5000, 'Comment cannot exceed 5000 characters']
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    required: true
  },
  parentComment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    default: null
  },
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
  replies: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment'
  }],
  replyCount: {
    type: Number,
    default: 0
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
commentSchema.methods.updateVoteCount = function() {
  this.voteCount = this.upvotes.length - this.downvotes.length;
};

// Upvote comment
commentSchema.methods.upvote = async function(userId) {
  const userIdStr = userId.toString();
  
  this.downvotes = this.downvotes.filter(id => id.toString() !== userIdStr);
  
  const upvoteIndex = this.upvotes.findIndex(id => id.toString() === userIdStr);
  if (upvoteIndex > -1) {
    this.upvotes.splice(upvoteIndex, 1);
  } else {
    this.upvotes.push(userId);
  }
  
  this.updateVoteCount();
  await this.save();
};

// Downvote comment
commentSchema.methods.downvote = async function(userId) {
  const userIdStr = userId.toString();
  
  this.upvotes = this.upvotes.filter(id => id.toString() !== userIdStr);
  
  const downvoteIndex = this.downvotes.findIndex(id => id.toString() === userIdStr);
  if (downvoteIndex > -1) {
    this.downvotes.splice(downvoteIndex, 1);
  } else {
    this.downvotes.push(userId);
  }
  
  this.updateVoteCount();
  await this.save();
};

// Soft delete
commentSchema.methods.softDelete = async function() {
  this.isDeleted = true;
  this.deletedAt = Date.now();
  await this.save();
};

// Indexes
commentSchema.index({ post: 1, createdAt: -1 });
commentSchema.index({ author: 1 });
commentSchema.index({ parentComment: 1 });
commentSchema.index({ isDeleted: 1 });

export default mongoose.model('Comment', commentSchema);