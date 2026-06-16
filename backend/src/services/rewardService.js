import prisma from '../config/prismaClient';

const POINT_TO_VND = 1000; // 1 điểm = 1.000đ

/**
 * Lấy tổng điểm tích lũy + lịch sử giao dịch
 */
export const getMyLoyaltyPoints = async (userId) => {
    const user = await prisma.user.findUnique({
        where: { id: Number(userId) },
        select: { loyaltyPoints: true },
    });

    const history = await prisma.loyaltyPoint.findMany({
        where: { userId: Number(userId) },
        orderBy: { createdAt: 'desc' },
        take: 50,
    });

    return {
        totalPoints: user?.loyaltyPoints || 0,
        equivalentVND: (user?.loyaltyPoints || 0) * POINT_TO_VND,
        pointToVND: POINT_TO_VND,
        history,
    };
};

/**
 * Lấy tổng hợp thưởng
 */
export const getRewardSummary = async (userId) => {
    const user = await prisma.user.findUnique({
        where: { id: Number(userId) },
        select: { loyaltyPoints: true },
    });

    const totalReviews = await prisma.review.count({ where: { userId: Number(userId) } });

    return {
        totalPoints: user?.loyaltyPoints || 0,
        equivalentVND: (user?.loyaltyPoints || 0) * POINT_TO_VND,
        pointToVND: POINT_TO_VND,
        totalReviews,
    };
};
