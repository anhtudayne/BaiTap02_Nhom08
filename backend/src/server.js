import 'dotenv/config';
import express from 'express';
import http from 'http';
import bodyParser from 'body-parser';
import cors from 'cors';
import connectDB from './config/configdb';
import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import adminRoutes from './routes/adminRoutes';
import uploadRoutes from './routes/uploadRoutes';
import courseRoutes from './routes/courseRoutes';
import orderRoutes from './routes/orderRoutes';
import sepayRoutes from './routes/sepayRoutes';
import cartRoutes from './routes/cartRoutes';
import reviewRoutes from './routes/reviewRoutes';
import rewardRoutes from './routes/rewardRoutes';
import couponRoutes from './routes/couponRoutes';
import favoriteRoutes from './routes/favoriteRoutes';
import viewedRoutes from './routes/viewedRoutes';
import notificationRoutes from './routes/notificationRoutes';
import statsRoutes from './routes/statsRoutes';
import errorHandler from './middlewares/errorHandler';
import { initSocket } from './socketManager';
import path from 'path';

let app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Default route
app.get('/', (req, res) => {
    return res.status(200).json({
        status: 200,
        message: 'E-Learning API Server đang hoạt động!',
        endpoints: {
            register: 'POST /api/auth/register',
            verifyOtp: 'POST /api/auth/verify-otp',
            resendOtp: 'POST /api/auth/resend-otp',
        },
    });
});

app.use('/api/auth', authRoutes);


// Placeholder for other functions
// app.use('/api/auth', loginRoutes);
// app.use('/api/auth', passwordRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api', courseRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/sepay', sepayRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/rewards', rewardRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/viewed', viewedRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/stats', statsRoutes);
import sectionRoutes from './routes/sectionRoutes';
import lessonRoutes from './routes/lessonRoutes';

app.use('/api/sections', sectionRoutes);
app.use('/api/lessons', lessonRoutes);

// Phục vụ các file tĩnh (ảnh avatar) từ thư mục public/uploads
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

app.use(errorHandler);

connectDB();

// Sync database is managed by Prisma via CLI (e.g., npx prisma db push)
// We don't sync database schemas at runtime manually.

let port = process.env.PORT || 8089;

// Create HTTP server and attach Socket.IO
const server = http.createServer(app);
initSocket(server);

server.listen(port, () => {
    console.log(`Server đang chạy tại: http://localhost:${port}`);
});
