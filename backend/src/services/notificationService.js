import prisma from '../config/prismaClient';
import { emitToUser } from '../socketManager';

/**
 * Create a notification, save to DB, and push via WebSocket.
 * Optionally sends email (handled by caller for specific types).
 */
export const createNotification = async (userId, type, title, message, data = null) => {
    try {
        const notification = await prisma.notification.create({
            data: {
                userId: Number(userId),
                type,
                title,
                message,
                data: data ? data : undefined,
                isRead: false,
                isEmailSent: false,
            }
        });

        // Push real-time via Socket.IO
        emitToUser(userId, 'new_notification', {
            id: notification.id,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            data: notification.data,
            isRead: notification.isRead,
            createdAt: notification.createdAt,
        });

        // Also push updated unread count
        const unreadCount = await getUnreadCount(userId);
        emitToUser(userId, 'unread_count', { count: unreadCount });

        return notification;
    } catch (error) {
        console.error('Lỗi tạo notification:', error);
        // Don't throw — notification failure should not break main flow
        return null;
    }
};

/**
 * Get notifications for a user with pagination.
 */
export const getNotifications = async (userId, page = 1, limit = 20) => {
    const skip = (Number(page) - 1) * Number(limit);

    const [rows, count] = await prisma.$transaction([
        prisma.notification.findMany({
            where: { userId: Number(userId) },
            orderBy: { createdAt: 'desc' },
            take: Number(limit),
            skip,
        }),
        prisma.notification.count({ where: { userId: Number(userId) } })
    ]);

    return {
        notifications: rows,
        pagination: {
            currentPage: Number(page),
            totalPages: Math.ceil(count / Number(limit)),
            totalItems: count,
        },
    };
};

/**
 * Mark a single notification as read.
 */
export const markAsRead = async (userId, notificationId) => {
    const notification = await prisma.notification.findFirst({
        where: { id: Number(notificationId), userId: Number(userId) },
    });

    if (!notification) {
        const error = new Error('Không tìm thấy thông báo.');
        error.statusCode = 404;
        throw error;
    }

    const updated = await prisma.notification.update({
        where: { id: notification.id },
        data: { isRead: true }
    });

    return updated;
};

/**
 * Mark all notifications as read for a user.
 */
export const markAllAsRead = async (userId) => {
    await prisma.notification.updateMany({
        where: { userId: Number(userId), isRead: false },
        data: { isRead: true }
    });

    // Push updated count (0)
    emitToUser(userId, 'unread_count', { count: 0 });
};

/**
 * Get unread notification count.
 */
export const getUnreadCount = async (userId) => {
    const count = await prisma.notification.count({
        where: { userId: Number(userId), isRead: false },
    });
    return count;
};
