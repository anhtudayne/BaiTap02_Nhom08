import prisma from '../config/prismaClient';
import * as notificationService from './notificationService';

const POINTS_PER_REVIEW = 10;

/**
 * Tạo đánh giá cho khóa học đã mua thành công.
 * Tự động cộng điểm tích lũy và cập nhật rating trung bình.
 */
export const createReview = async (userId, courseId, rating, comment) => {
    try {
        return await prisma.$transaction(async (tx) => {
            // 1. Kiểm tra user đã mua khóa học chưa (Order status = 'paid' chứa courseId)
            const paidOrder = await tx.order.findFirst({
                where: {
                    userId: Number(userId),
                    status: 'paid',
                    orderItems: {
                        some: { courseId: Number(courseId) }
                    }
                }
            });

            if (!paidOrder) {
                const error = new Error('Bạn chưa mua khóa học này hoặc đơn hàng chưa thanh toán.');
                error.statusCode = 400;
                throw error;
            }

            // 2. Kiểm tra đã review chưa
            const existingReview = await tx.review.findFirst({
                where: { userId: Number(userId), courseId: Number(courseId) },
            });

            if (existingReview) {
                const error = new Error('Bạn đã đánh giá khóa học này rồi.');
                error.statusCode = 400;
                throw error;
            }

            // 3. Tạo review
            const review = await tx.review.create({
                data: {
                    userId: Number(userId),
                    courseId: Number(courseId),
                    orderId: paidOrder.id,
                    rating: Number(rating),
                    comment: comment || null,
                }
            });

            // 4. Cập nhật rating trung bình của khóa học
            const avgResult = await tx.review.aggregate({
                where: { courseId: Number(courseId) },
                _avg: { rating: true },
            });

            const avgRating = avgResult._avg.rating || 0;
            await tx.course.update({
                where: { id: Number(courseId) },
                data: { rating: Math.round(avgRating * 10) / 10 }
            });

            // 5. Cộng điểm tích lũy cho user
            await tx.user.update({
                where: { id: Number(userId) },
                data: { loyaltyPoints: { increment: POINTS_PER_REVIEW } }
            });

            // 6. Ghi log lịch sử điểm
            const courseName = await tx.course.findUnique({
                where: { id: Number(courseId) },
                select: { name: true },
            });

            await tx.loyaltyPoint.create({
                data: {
                    userId: Number(userId),
                    points: POINTS_PER_REVIEW,
                    type: 'earn',
                    description: `Đánh giá khóa học "${courseName?.name || courseId}"`,
                    referenceId: review.id,
                }
            });

            // === NOTIFICATION: Review created + points earned ===
            try {
                await notificationService.createNotification(
                    userId,
                    'new_review',
                    '⭐ Đánh giá thành công!',
                    `Bạn đã đánh giá khóa học "${courseName?.name || 'Khóa học'}" và nhận được +${POINTS_PER_REVIEW} điểm tích lũy!`,
                    { courseId, courseName: courseName?.name, pointsEarned: POINTS_PER_REVIEW, reviewId: review.id }
                );
            } catch (notifErr) {
                console.error('Lỗi gửi notification review (không ảnh hưởng review):', notifErr);
            }

            return {
                review,
                pointsEarned: POINTS_PER_REVIEW,
                newAvgRating: Math.round(avgRating * 10) / 10,
            };
        });
    } catch (error) {
        throw error;
    }
};

/**
 * Lấy danh sách đánh giá theo khóa học (có phân trang)
 */
export const getReviewsByCourse = async (courseId, page = 1, limit = 10) => {
    const skip = (Number(page) - 1) * Number(limit);

    const [rows, count] = await prisma.$transaction([
        prisma.review.findMany({
            where: { courseId: Number(courseId) },
            include: {
                user: {
                    select: { id: true, firstName: true, lastName: true, image: true }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: Number(limit),
            skip,
        }),
        prisma.review.count({ where: { courseId: Number(courseId) } })
    ]);

    // Lấy thống kê rating
    const ratingStats = await prisma.review.groupBy({
        by: ['rating'],
        where: { courseId: Number(courseId) },
        _count: { id: true }
    });

    // Chuyển thành object { 1: count, 2: count, ... 5: count }
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    ratingStats.forEach(stat => {
        distribution[stat.rating] = stat._count.id;
    });

    return {
        reviews: rows,
        pagination: {
            currentPage: Number(page),
            totalPages: Math.ceil(count / Number(limit)),
            totalItems: count,
        },
        ratingDistribution: distribution,
    };
};

/**
 * Lấy tất cả review của user
 */
export const getMyReviews = async (userId) => {
    const reviews = await prisma.review.findMany({
        where: { userId: Number(userId) },
        include: {
            course: {
                select: { id: true, name: true, slug: true, thumbnail: true }
            }
        },
        orderBy: { createdAt: 'desc' },
    });

    return reviews;
};

/**
 * Kiểm tra user có quyền đánh giá khóa học không
 */
export const checkCanReview = async (userId, courseId) => {
    // Kiểm tra đã mua chưa
    const paidOrder = await prisma.order.findFirst({
        where: {
            userId: Number(userId),
            status: 'paid',
            orderItems: {
                some: { courseId: Number(courseId) }
            }
        }
    });

    if (!paidOrder) {
        return { canReview: false, reason: 'Bạn chưa mua khóa học này.' };
    }

    // Kiểm tra đã review chưa
    const existingReview = await prisma.review.findFirst({
        where: { userId: Number(userId), courseId: Number(courseId) },
    });

    if (existingReview) {
        return { canReview: false, reason: 'Bạn đã đánh giá khóa học này rồi.', existingReview };
    }

    return { canReview: true };
};
