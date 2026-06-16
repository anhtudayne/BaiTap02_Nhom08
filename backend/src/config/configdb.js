import prisma from './prismaClient';

let connectDB = async () => {
    try {
        await prisma.$connect();
        console.log('Kết nối Prisma database thành công.');
    } catch (error) {
        console.error('Không thể kết nối Prisma database:', error);
        process.exit(1);
    }
};

export default connectDB;
