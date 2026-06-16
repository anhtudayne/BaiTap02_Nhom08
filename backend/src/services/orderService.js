import prisma from '../config/prismaClient';
import * as couponService from './couponService';
import * as notificationService from './notificationService';

export const createOrderFromCart = async (userId, bankAccount, bankName, usePoints = 0, couponCode = null) => {
    const POINT_TO_VND = 1000;
    try {
        return await prisma.$transaction(async (tx) => {
            // 1. Lấy giỏ hàng của user
            const cartItems = await tx.cart.findMany({
                where: { userId: Number(userId) },
                include: { course: true },
            });

            if (!cartItems || cartItems.length === 0) {
                const error = new Error('Giỏ hàng trống.');
                error.statusCode = 400;
                throw error;
            }

            // 2. Tính tổng tiền ban đầu (cartTotal)
            let cartTotal = 0;
            const orderItemsData = [];
            
            for (const item of cartItems) {
                const price = item.course.salePrice ? item.course.salePrice : item.course.price;
                cartTotal += Number(price);
                
                orderItemsData.push({
                    courseId: item.courseId,
                    price: price
                });
            }

            // 3. Áp dụng mã giảm giá (Coupon)
            let discountFromCoupon = 0;
            let subTotal = cartTotal;
            if (couponCode) {
                const validateResult = await couponService.validateCoupon(couponCode, cartTotal);
                discountFromCoupon = validateResult.discountAmount;
                subTotal = validateResult.finalTotal;
            }

            // 4. Áp dụng điểm tích lũy (Points)
            let pointsUsed = 0;
            let discountFromPoints = 0;
            let finalTotal = subTotal;
            
            if (usePoints && usePoints > 0) {
                const user = await tx.user.findUnique({ where: { id: Number(userId) } });
                if (user.loyaltyPoints < usePoints) {
                    const error = new Error(`Bạn không đủ điểm tích lũy. Hiện có: ${user.loyaltyPoints} điểm.`);
                    error.statusCode = 400;
                    throw error;
                }
                
                discountFromPoints = usePoints * POINT_TO_VND;
                // Không cho giảm quá số tiền còn lại (subTotal)
                if (discountFromPoints > subTotal) {
                    discountFromPoints = subTotal;
                    pointsUsed = Math.ceil(subTotal / POINT_TO_VND);
                } else {
                    pointsUsed = usePoints;
                }
                finalTotal -= discountFromPoints;

                // Trừ điểm
                if (pointsUsed > 0) {
                    await tx.user.update({
                        where: { id: Number(userId) },
                        data: { loyaltyPoints: { decrement: pointsUsed } }
                    });
                }
            }

            // 5. Kiểm tra nếu thanh toán toàn bộ bằng mã/điểm
            const isFullyPaid = finalTotal <= 0;
            
            // 6. Tạo Order
            const orderCode = `DH${userId}${Date.now()}`;
            
            const order = await tx.order.create({
                data: {
                    code: orderCode,
                    userId: Number(userId),
                    totalAmount: finalTotal,
                    status: isFullyPaid ? 'paid' : 'pending',
                    paymentMethod: isFullyPaid ? 'points_coupon' : 'bank_transfer',
                    couponCode: couponCode || null,
                    discountFromCoupon,
                    discountFromPoints
                }
            });

            // 7. Tạo Order Items
            const itemsToCreate = orderItemsData.map(item => ({
                ...item,
                orderId: order.id
            }));
            await tx.orderItem.createMany({ data: itemsToCreate });

            // 8. Cấp quyền truy cập ngay nếu isFullyPaid
            if (isFullyPaid) {
                const courseAccessData = itemsToCreate.map(item => ({
                    userId: Number(userId),
                    courseId: item.courseId,
                    status: 'active'
                }));
                await tx.userCourse.createMany({ data: courseAccessData });
            }

            // 9. Ghi log nếu dùng điểm
            if (pointsUsed > 0) {
                await tx.loyaltyPoint.create({
                    data: {
                        userId: Number(userId),
                        points: -pointsUsed,
                        type: 'spend',
                        description: `Thanh toán đơn hàng ${orderCode} (-${discountFromPoints.toLocaleString('vi-VN')}đ)`,
                        referenceId: order.id,
                    }
                });
            }

            // 10. Tăng số lượt dùng của coupon
            if (couponCode && discountFromCoupon > 0) {
                await couponService.incrementCouponUsage(couponCode, tx);
            }

            // 11. Xóa giỏ hàng
            await tx.cart.deleteMany({ where: { userId: Number(userId) } });

            // 12. Xử lý trả về
            if (isFullyPaid) {
                // === NOTIFICATION: Order fully paid by points/coupon ===
                try {
                    const courseNames = cartItems.map(item => item.course?.name || 'Khóa học');
                    await notificationService.createNotification(
                        userId,
                        'order_paid',
                        '✅ Thanh toán thành công!',
                        `Đơn hàng ${orderCode} đã thanh toán hoàn toàn bằng điểm/mã giảm giá.`,
                        { orderId: order.id, orderCode, courseNames }
                    );
                } catch (notifErr) {
                    console.error('Lỗi gửi notification (không ảnh hưởng đơn hàng):', notifErr);
                }

                return {
                    orderCode,
                    totalAmount: finalTotal,
                    pointsUsed,
                    discountFromPoints,
                    discountFromCoupon,
                    qrUrl: null,
                    isFullyPaid: true
                };
            }

            // Tạo link VietQR
            const finalBankAccount = bankAccount || process.env.BANK_ACCOUNT || '0000000000';
            const finalBankName = bankName || process.env.BANK_NAME || 'MBBank';
            const qrUrl = `https://qr.sepay.vn/img?acc=${finalBankAccount}&bank=${finalBankName}&amount=${finalTotal}&des=${orderCode}`;

            // === NOTIFICATION: Order created (pending payment) ===
            try {
                const courseNames = cartItems.map(item => item.course?.name || 'Khóa học');
                await notificationService.createNotification(
                    userId,
                    'order_created',
                    '📦 Đơn hàng mới đã tạo',
                    `Đơn hàng ${orderCode} đang chờ thanh toán. Tổng: ${finalTotal.toLocaleString('vi-VN')}đ`,
                    { orderId: order.id, orderCode, totalAmount: finalTotal, courseNames }
                );
            } catch (notifErr) {
                console.error('Lỗi gửi notification (không ảnh hưởng đơn hàng):', notifErr);
            }

            return {
                orderCode,
                totalAmount: finalTotal,
                pointsUsed,
                discountFromPoints,
                discountFromCoupon,
                qrUrl,
                isFullyPaid: false
            };
        });
    } catch (error) {
        console.error('Lỗi service createOrder:', error);
        throw error;
    }
};

export const checkOrderStatus = async (userId, orderCode) => {
    try {
        const order = await prisma.order.findFirst({
            where: { code: orderCode, userId: Number(userId) }
        });

        if (!order) {
            const error = new Error('Không tìm thấy đơn hàng');
            error.statusCode = 404;
            throw error;
        }

        return {
            status: order.status,
            isPaid: order.status === 'paid'
        };
    } catch (error) {
        console.error('Lỗi service checkOrderStatus:', error);
        throw error;
    }
};

export const getMyOrders = async (userId) => {
    try {
        const orders = await prisma.order.findMany({
            where: { userId: Number(userId) },
            include: {
                orderItems: {
                    include: {
                        course: {
                            select: { id: true, name: true, slug: true, thumbnail: true }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        return orders;
    } catch (error) {
        console.error('Lỗi service getMyOrders:', error);
        throw error;
    }
};

export const getOrderDetails = async (userId, orderId) => {
    try {
        const order = await prisma.order.findFirst({
            where: { id: Number(orderId), userId: Number(userId) },
            include: {
                orderItems: {
                    include: {
                        course: {
                            select: { id: true, name: true, slug: true, thumbnail: true, price: true, salePrice: true }
                        }
                    }
                }
            }
        });

        if (!order) {
            const error = new Error('Không tìm thấy đơn hàng');
            error.statusCode = 404;
            throw error;
        }

        return order;
    } catch (error) {
        console.error('Lỗi service getOrderDetails:', error);
        throw error;
    }
};

export const cancelOrder = async (userId, orderId) => {
    try {
        const order = await prisma.order.findFirst({
            where: { id: Number(orderId), userId: Number(userId) }
        });

        if (!order) {
            const error = new Error('Không tìm thấy đơn hàng');
            error.statusCode = 404;
            throw error;
        }

        if (order.status !== 'pending') {
            const error = new Error('Chỉ có thể hủy đơn hàng đang chờ thanh toán');
            error.statusCode = 400;
            throw error;
        }

        const updatedOrder = await prisma.order.update({
            where: { id: order.id },
            data: { status: 'cancelled' }
        });

        return updatedOrder;
    } catch (error) {
        console.error('Lỗi service cancelOrder:', error);
        throw error;
    }
};
