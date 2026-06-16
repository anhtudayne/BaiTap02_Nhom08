import prisma from '../config/prismaClient';

export const handleCreateLesson = async (req, res, next) => {
    try {
        const { sectionId, title, type, content, videoUrl, duration, order } = req.body;
        if (!sectionId || !title) {
            return res.status(400).json({ status: 400, message: 'Thiếu thông tin sectionId hoặc title' });
        }
        
        const lesson = await prisma.lesson.create({ 
            data: {
                sectionId: Number(sectionId), 
                title, 
                type: type || 'video', 
                content, 
                videoUrl, 
                duration: duration ? Number(duration) : null, 
                order: order || 0 
            }
        });
        return res.status(201).json({ status: 201, message: 'Tạo bài học thành công', data: lesson });
    } catch (error) {
        next(error);
    }
};

export const handleGetLessons = async (req, res, next) => {
    try {
        const { sectionId } = req.query;
        let where = {};
        if (sectionId) where.sectionId = Number(sectionId);

        const lessons = await prisma.lesson.findMany({
            where,
            orderBy: { order: 'asc' }
        });
        
        return res.status(200).json({ status: 200, data: lessons });
    } catch (error) {
        next(error);
    }
};

export const handleDeleteLesson = async (req, res, next) => {
    try {
        const { id } = req.params;
        const lesson = await prisma.lesson.findUnique({
            where: { id: Number(id) }
        });
        
        if (!lesson) {
            return res.status(404).json({ status: 404, message: 'Không tìm thấy bài học' });
        }
        
        await prisma.lesson.delete({
            where: { id: Number(id) }
        });
        return res.status(200).json({ status: 200, message: 'Xóa bài học thành công' });
    } catch (error) {
        next(error);
    }
};
