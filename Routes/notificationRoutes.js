import express from 'express';
import { getNotifications , markAsRead , markAllAsRead , deleteNotification , clearAllNotifications , getUnreadCount } from '../Controllers/notificationController.js';
import { protect } from '../Middlewares/AuthMiddleware.js';

// All routes are protected
const router = express.Router();
router.use(protect);

router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);
router.put('/:id/read', markAsRead);
router.put('/mark-all-read', markAllAsRead);
router.delete('/:id', deleteNotification);
router.delete('/', clearAllNotifications);

export default router;