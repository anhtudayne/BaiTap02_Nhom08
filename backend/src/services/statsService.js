import prisma from '../config/prismaClient';

export const getDashboardStatsService = async (startDate, endDate) => {
    try {
        const dateFilter = {};
        if (startDate && endDate) {
            // Include full end day
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            dateFilter.createdAt = {
                gte: new Date(startDate),
                lte: end
            };
        } else {
            // Default 30 days
            const end = new Date();
            const start = new Date();
            start.setDate(end.getDate() - 29);
            start.setHours(0, 0, 0, 0);
            dateFilter.createdAt = {
                gte: start,
                lte: end
            };
        }

        const orders = await prisma.order.findMany({
            where: dateFilter,
            select: { id: true, status: true, totalAmount: true, createdAt: true }
        });

        let totalRevenue = 0;
        let totalOrdersCount = orders.length;
        let revenueByStatus = { paid: 0, pending: 0, cancelled: 0 };
        const revenueChartMap = {};

        orders.forEach(order => {
            const amount = Number(order.totalAmount || 0);
            const status = order.status || 'pending';
            
            if (revenueByStatus[status] !== undefined) {
                revenueByStatus[status] += amount;
            } else {
                revenueByStatus[status] = amount;
            }
            
            if (status === 'paid') {
                totalRevenue += amount;
                
                const dateStr = new Date(order.createdAt).toISOString().split('T')[0];
                if (!revenueChartMap[dateStr]) {
                    revenueChartMap[dateStr] = 0;
                }
                revenueChartMap[dateStr] += amount;
            }
        });

        const revenueChart = Object.keys(revenueChartMap).map(date => ({
            date,
            revenue: revenueChartMap[date]
        })).sort((a, b) => new Date(a.date) - new Date(b.date));

        const totalCustomers = await prisma.user.count({
            where: {
                roleId: 'user',
                ...dateFilter
            }
        });

        // Top 10 courses
        const orderItemsForTop = await prisma.orderItem.findMany({
            where: {
                order: {
                    status: 'paid',
                    ...dateFilter
                }
            },
            include: {
                course: {
                    select: { id: true, name: true, thumbnail: true, price: true }
                }
            }
        });

        const courseSales = {};
        for (const item of orderItemsForTop) {
            if (!item.course) continue; // just in case
            if (!courseSales[item.courseId]) {
                courseSales[item.courseId] = {
                    courseId: item.courseId,
                    salesCount: 0,
                    totalCourseRevenue: 0,
                    course: item.course
                };
            }
            courseSales[item.courseId].salesCount += 1;
            courseSales[item.courseId].totalCourseRevenue += Number(item.price);
        }

        const formattedTopCourses = Object.values(courseSales)
            .sort((a, b) => b.salesCount - a.salesCount)
            .slice(0, 10);

        const recentOrders = await prisma.order.findMany({
            where: dateFilter,
            include: { user: { select: { id: true, firstName: true, lastName: true, email: true, image: true } } },
            orderBy: { createdAt: 'desc' },
            take: 20
        });

        return {
            status: 200,
            data: {
                totalRevenue,
                totalOrders: totalOrdersCount,
                totalCustomers,
                revenueByStatus,
                revenueChart,
                topCourses: formattedTopCourses,
                recentOrders
            }
        };

    } catch (error) {
        console.error("Error in getDashboardStatsService:", error);
        return {
            status: 500,
            message: "Lỗi khi lấy dữ liệu thống kê"
        };
    }
};
