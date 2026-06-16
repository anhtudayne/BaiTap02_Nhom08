import prisma from '../config/prismaClient';
import slugify from 'slugify';

const courseInclude = {
    category: { select: { id: true, name: true, slug: true } },
    images: { select: { id: true, imageUrl: true, isPrimary: true, sortOrder: true } }
};

const courseDetailInclude = {
    ...courseInclude,
    sections: {
        orderBy: { order: 'asc' },
        include: {
            lessons: { orderBy: { order: 'asc' } }
        }
    }
};

const getCourses = async (params) => {
    const { search, categories, levels, min_price, max_price, sort = 'newest', page = 1, limit = 12, status = 'published' } = params;
    const where = {};

    if (status !== 'all') {
        where.status = status;
    }

    if (search) {
        where.name = { contains: search };
    }
    
    if (categories) {
        const catArray = typeof categories === 'string' ? categories.split(',') : categories;
        where.categoryId = { in: catArray.map(Number) };
    }
    
    if (levels) {
        const levelArray = typeof levels === 'string' ? levels.split(',') : levels;
        where.level = { in: levelArray };
    }
    
    if (min_price || max_price) {
        where.price = {};
        if (min_price) where.price.gte = Number(min_price);
        if (max_price) where.price.lte = Number(max_price);
    }

    let orderBy = [];
    switch (sort) {
        case 'newest':
            orderBy = [{ isNewArrival: 'desc' }, { createdAt: 'desc' }];
            break;
        case 'price_asc':
            orderBy = [{ price: 'asc' }];
            break;
        case 'price_desc':
            orderBy = [{ price: 'desc' }];
            break;
        case 'rating_desc':
            orderBy = [{ rating: 'desc' }];
            break;
        case 'best_seller':
            orderBy = [{ isBestSeller: 'desc' }, { totalStudents: 'desc' }];
            break;
        default:
            orderBy = [{ createdAt: 'desc' }];
    }

    const parsedLimit = parseInt(limit);
    const parsedPage = parseInt(page);
    const skip = (parsedPage - 1) * parsedLimit;
    
    const [rows, count] = await prisma.$transaction([
        prisma.course.findMany({ where, include: courseInclude, orderBy, take: parsedLimit, skip }),
        prisma.course.count({ where })
    ]);
    
    return { 
        data: rows, 
        pagination: { 
            currentPage: parsedPage, 
            totalPages: Math.ceil(count / parsedLimit),
            totalItems: count
        } 
    };
};

const getFeaturedCourses = async () => {
    const data = await prisma.course.findMany({ where: { isFeatured: true, status: 'published' }, include: courseInclude, take: 8 });
    return { data };
};

const getNewArrivals = async () => {
    const data = await prisma.course.findMany({ where: { status: 'published' }, include: courseInclude, orderBy: { createdAt: 'desc' }, take: 8 });
    return { data };
};

const getBestSellers = async () => {
    const data = await prisma.course.findMany({ where: { isBestSeller: true, status: 'published' }, include: courseInclude, orderBy: { totalStudents: 'desc' }, take: 8 });
    return { data };
};

const getCourseBySlug = async (slug) => {
    const course = await prisma.course.findUnique({ 
        where: { slug }, 
        include: courseDetailInclude
    });
    if (!course) return { data: null };
    
    const buyersCount = await prisma.userCourse.count({ where: { courseId: course.id } });
    const reviewsCount = await prisma.review.count({ where: { courseId: course.id } });
    
    return { data: { ...course, buyersCount, reviewsCount } };
};

const getRelatedCourses = async (id) => {
    const course = await prisma.course.findUnique({ where: { id: Number(id) } });
    if (!course) return { data: [] };
    const data = await prisma.course.findMany({
        where: { categoryId: course.categoryId, id: { not: Number(id) }, status: 'published' },
        include: courseInclude, take: 4,
    });
    return { data };
};

const getCategories = async () => {
    const data = await prisma.category.findMany({ orderBy: { name: 'asc' } });
    return { data };
};

const createCourse = async (courseData) => {
    try {
        if (!courseData.slug && courseData.name) {
            courseData.slug = slugify(courseData.name, { lower: true, strict: true }) + '-' + Date.now();
        }
        courseData.status = 'draft';
        const newCourse = await prisma.course.create({ data: courseData });
        return { data: newCourse };
    } catch (error) {
        throw error;
    }
};

const publishCourse = async (id) => {
    const course = await prisma.course.findUnique({ where: { id: Number(id) } });
    if (!course) return { status: 404, message: 'Không tìm thấy khóa học.' };
    
    const updatedCourse = await prisma.course.update({
        where: { id: Number(id) },
        data: { status: 'published' }
    });
    return { status: 200, message: 'Đã xuất bản khóa học!', data: updatedCourse };
};

const getCoursesByCategory = async (categorySlug, page = 1, limit = 6) => {
    const category = await prisma.category.findUnique({ where: { slug: categorySlug } });
    if (!category) return { status: 404, message: 'Không tìm thấy danh mục.' };

    const skip = (Number(page) - 1) * Number(limit);
    
    const [rows, count] = await prisma.$transaction([
        prisma.course.findMany({
            where: { categoryId: category.id, status: 'published' },
            include: courseInclude,
            orderBy: { createdAt: 'desc' },
            take: Number(limit),
            skip
        }),
        prisma.course.count({ where: { categoryId: category.id, status: 'published' } })
    ]);

    return {
        status: 200,
        category: { id: category.id, name: category.name, slug: category.slug },
        data: rows,
        pagination: { total: count, page: Number(page), limit: Number(limit), totalPages: Math.ceil(count / Number(limit)) },
    };
};

const getTopViewedCourses = async () => {
    const data = await prisma.course.findMany({
        where: { status: 'published' },
        orderBy: { viewCount: 'desc' },
        take: 10,
        include: courseInclude
    });
    return { status: 200, data };
};

const incrementViewCount = async (id) => {
    await prisma.course.update({
        where: { id: Number(id) },
        data: { viewCount: { increment: 1 } }
    });
    return { status: 200, message: 'View count updated successfully' };
};

const checkEnrollmentService = async (userId, slug) => {
    const course = await prisma.course.findUnique({ where: { slug } });
    if (!course) return { enrolled: false };
    const enrollment = await prisma.userCourse.findFirst({ where: { userId: Number(userId), courseId: course.id } });
    return { enrolled: !!enrollment, courseId: course.id };
};

module.exports = { getCourses, getFeaturedCourses, getNewArrivals, getBestSellers, getCourseBySlug, getRelatedCourses, getCategories, createCourse, publishCourse, getCoursesByCategory, getTopViewedCourses, incrementViewCount, checkEnrollmentService };