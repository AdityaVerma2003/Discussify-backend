import mongoose from 'mongoose';


const communitySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Community name is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Community name must be at least 3 characters'],
    maxlength: [50, 'Community name cannot exceed 50 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true
  },
  categories: [{
    type: String,
    enum: [
      'Technology',
      'Gaming',
      'Sports',
      'Music',
      'Art',
      'Education',
      'Science',
      'Business',
      'Health',
      'Food',
      'Travel',
      'Fashion',
      'Entertainment',
      'Books',
      'Photography',
      'Other'
    ]
  }],
  coverImage: {
    type: String,
    default: null
  },
  icon: {
    type: String,
    default: null
  },
  isPrivate: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  moderators: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    role: {
      type: String,
      enum: ['member', 'moderator', 'admin'],
      default: 'member'
    }
  }],
  memberCount: {
    type: Number,
    default: 0
  },
  postCount: {
    type: Number,
    default: 0
  },
  rules: [{
    title: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true
    }
  }],
  tags: [{
    type: String,
    trim: true
  }],
  settings: {
    allowPostCreation: {
      type: Boolean,
      default: true
    },
    requireApproval: {
      type: Boolean,
      default: false
    },
    allowComments: {
      type: Boolean,
      default: true
    },
    allowPolls: {
      type: Boolean,
      default: true
    }
  },
  visibility: {
    type: String,
    enum: ['public', 'private', 'hidden'],
    default: 'public'
  },
  bannedUsers: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    bannedAt: {
      type: Date,
      default: Date.now
    },
    reason: String
  }]
}, {
  timestamps: true
});

// Create slug from name before saving
communitySchema.pre('save', function() {
  if (this.isModified('name')) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
});

// Update member count
communitySchema.methods.updateMemberCount = async function() {
  this.memberCount = this.members.length;
  await this.save();
};

// Check if user is admin
communitySchema.methods.isAdmin = function(userId) {
  return this.admin.toString() === userId.toString();
};

// Check if user is moderator
communitySchema.methods.isModerator = function(userId) {
  return this.moderators.some(mod => mod.toString() === userId.toString());
};

// Check if user is member
communitySchema.methods.isMember = function(userId) {
  return this.members.some(member => member.user.toString() === userId.toString());
};

// Check if user is banned
communitySchema.methods.isBanned = function(userId) {
  return this.bannedUsers.some(banned => banned.user.toString() === userId.toString());
};

// Add member
communitySchema.methods.addMember = async function(userId) {
  if (this.isMember(userId)) {
    throw new Error('User is already a member');
  }
  
  this.members.push({ user: userId });
  await this.updateMemberCount();
};

// Remove member
communitySchema.methods.removeMember = async function(userId) {
  this.members = this.members.filter(
    member => member.user.toString() !== userId.toString()
  );
  await this.updateMemberCount();
};

// Indexes for better query performance
communitySchema.index({ name: 1 });
communitySchema.index({ slug: 1 });
communitySchema.index({ categories: 1 });
communitySchema.index({ isActive: 1, visibility: 1 });
communitySchema.index({ 'members.user': 1 });

// 💡 THE FIX: Check if the model already exists before compiling it.
const Community = mongoose.models.Community || mongoose.model('Community', communitySchema);

export default Community;