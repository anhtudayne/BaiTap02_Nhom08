import prisma from '../config/prismaClient';

const courseInclude = {
    category: { select: { id: true, name: true, slug: true } },
    images: { select: { id: true, imageUrl: true, isPrimary: true, sortOrder: true } }
};

const addViewedCourse = async (userId, courseId) => {
    const existing = await prisma.viewedCourse.findFirst({
        where: { userId: Number(userId), courseId: Number(courseId) }
    });

    if (existing) {
        await prisma.viewedCourse.update({
            where: { id: existing.id },
            data: { updatedAt: new Date() }
        });
    } else {
        await prisma.viewedCourse.create({
            data: { userId: Number(userId), courseId: Number(courseId) }
        });
    }

    return { success: true };
};

const getViewedCourses = async (userId) => {
    const viewedRecords = await prisma.viewedCourse.findMany({
        where: { userId: Number(userId) },
        include: {
            course: {
                include: courseInclude
            }
        },
        orderBy: { updatedAt: 'desc' },
        take: 8
    });

    // Extract courses and filter out nulls
    const data = viewedRecords.map(vr => vr.course).filter(course => course !== null);
    return { data };
};

module.exports = {
    addViewedCourse,
    getViewedCourses
};
