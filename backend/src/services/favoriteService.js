import prisma from '../config/prismaClient';

const courseInclude = {
    category: { select: { id: true, name: true, slug: true } },
    images: { select: { id: true, imageUrl: true, isPrimary: true, sortOrder: true } }
};

const toggleFavoriteCourse = async (userId, courseId) => {
    const existing = await prisma.favoriteCourse.findFirst({
        where: { userId: Number(userId), courseId: Number(courseId) }
    });

    if (existing) {
        await prisma.favoriteCourse.delete({ where: { id: existing.id } });
        return { isFavorite: false, message: 'Đã xóa khỏi danh sách yêu thích.' };
    } else {
        await prisma.favoriteCourse.create({ data: { userId: Number(userId), courseId: Number(courseId) } });
        return { isFavorite: true, message: 'Đã thêm vào danh sách yêu thích.' };
    }
};

const getFavoriteCourses = async (userId) => {
    const favorites = await prisma.favoriteCourse.findMany({
        where: { userId: Number(userId) },
        include: {
            course: {
                include: courseInclude
            }
        },
        orderBy: { createdAt: 'desc' }
    });

    // Extract courses and filter out nulls
    const data = favorites.map(fav => fav.course).filter(course => course !== null);
    return { data };
};

module.exports = {
    toggleFavoriteCourse,
    getFavoriteCourses
};
