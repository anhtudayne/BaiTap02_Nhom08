import prisma from '../config/prismaClient';

const courseSelect = {
    id: true,
    name: true,
    slug: true,
    price: true,
    salePrice: true,
    instructor: true,
    thumbnail: true,
    rating: true,
    level: true,
    duration: true,
    totalLessons: true,
    category: {
        select: {
            id: true,
            name: true,
        }
    }
};

export const getCart = async (userId) => {
    try {
        const cartItems = await prisma.cart.findMany({
            where: { userId },
            select: {
                id: true,
                userId: true,
                courseId: true,
                createdAt: true,
                updatedAt: true,
                course: {
                    select: courseSelect
                }
            },
            orderBy: { createdAt: 'desc' },
        });
        return { status: 200, data: cartItems };
    } catch (error) {
        throw error;
    }
};

export const addToCart = async (userId, courseId) => {
    try {
        // Kiểm tra khóa học tồn tại
        const course = await prisma.course.findUnique({ where: { id: courseId } });
        if (!course) return { status: 404, message: 'Khóa học không tồn tại' };

        // Kiểm tra đã có trong giỏ chưa
        const existing = await prisma.cart.findFirst({ where: { userId, courseId } });
        if (existing) return { status: 400, message: 'Khóa học đã có trong giỏ hàng' };

        const newItem = await prisma.cart.create({ data: { userId, courseId } });
        return { status: 201, message: 'Thêm vào giỏ hàng thành công', data: newItem };
    } catch (error) {
        throw error;
    }
};

export const removeCartItem = async (userId, cartId) => {
    try {
        const cartItem = await prisma.cart.findFirst({ where: { id: cartId, userId } });
        if (!cartItem) return { status: 404, message: 'Không tìm thấy khóa học trong giỏ hàng' };

        await prisma.cart.delete({ where: { id: cartItem.id } });
        return { status: 200, message: 'Xóa khóa học khỏi giỏ hàng thành công' };
    } catch (error) {
        throw error;
    }
};

export const clearCart = async (userId) => {
    try {
        await prisma.cart.deleteMany({ where: { userId } });
        return { status: 200, message: 'Xóa toàn bộ giỏ hàng thành công' };
    } catch (error) {
        throw error;
    }
};

export const getCartCount = async (userId) => {
    try {
        const count = await prisma.cart.count({ where: { userId } });
        return { status: 200, data: { count } };
    } catch (error) {
        throw error;
    }
};
