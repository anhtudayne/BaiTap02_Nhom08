import bcrypt from 'bcryptjs';
import prisma from '../config/prismaClient';
import { generateOTP, getOTPExpireTime } from '../utils/otpHelper';
import { sendOTPEmail } from './emailService';
import { generateToken } from '../utils/jwtHelper';
const salt = bcrypt.genSaltSync(10);

// Register user
export const registerUser = async (data) => {
    try {
        const existingUser = await prisma.user.findUnique({ where: { email: data.email } });

        if (existingUser) {
            // Re-register if not active
            if (!existingUser.isActive) {
                const otpCode = generateOTP();
                const otpExpires = getOTPExpireTime();
                const hashedPassword = bcrypt.hashSync(data.password, salt);

                await prisma.user.update({
                    where: { id: existingUser.id },
                    data: {
                        password: hashedPassword,
                        firstName: data.firstName,
                        lastName: data.lastName,
                        phoneNumber: data.phoneNumber || null,
                        address: data.address || null,
                        gender: data.gender !== undefined ? data.gender : true,
                        otp: otpCode,
                        otpExpires: otpExpires,
                    }
                });

                let emailSent = true;
                try {
                    await sendOTPEmail(data.email, otpCode, data.firstName);
                } catch (emailError) {
                    console.error('Không thể gửi email OTP:', emailError.message);
                    emailSent = false;
                }

                const response = {
                    status: 200,
                    message: emailSent
                        ? 'Đã gửi lại mã OTP kích hoạt. Vui lòng kiểm tra email.'
                        : 'Đã cập nhật OTP. Tuy nhiên không thể gửi email. Vui lòng thử lại.',
                    emailSent: emailSent,
                };

                if (process.env.NODE_ENV === 'development') {
                    response.devInfo = { otp: otpCode, otpExpires: otpExpires };
                }
                return response;
            }
            return {
                status: 409,
                message: 'Email đã được đăng ký và kích hoạt. Vui lòng sử dụng email khác.',
            };
        }

        const hashedPassword = bcrypt.hashSync(data.password, salt);
        const otpCode = generateOTP();
        const otpExpires = getOTPExpireTime();

        await prisma.user.create({
            data: {
                email: data.email,
                password: hashedPassword,
                firstName: data.firstName,
                lastName: data.lastName,
                phoneNumber: data.phoneNumber || null,
                address: data.address || null,
                gender: data.gender !== undefined ? data.gender : true,
                roleId: 'user',
                isActive: false,
                otp: otpCode,
                otpExpires: otpExpires,
            }
        });

        let emailSent = true;
        try {
            await sendOTPEmail(data.email, otpCode, data.firstName);
        } catch (emailError) {
            console.error('Không thể gửi email OTP:', emailError.message);
            emailSent = false;
        }

        const response = {
            status: 201,
            message: emailSent
                ? 'Đăng ký thành công! Vui lòng kiểm tra email để nhận mã OTP kích hoạt tài khoản.'
                : 'Đăng ký thành công! Tuy nhiên không thể gửi email OTP. Vui lòng dùng chức năng gửi lại OTP.',
            emailSent: emailSent,
        };

        if (process.env.NODE_ENV === 'development') {
            response.devInfo = {
                otp: otpCode,
                otpExpires: otpExpires,
                note: 'Thông tin OTP chỉ hiển thị trong môi trường development',
            };
        }
        return response;
    } catch (error) {
        console.error('Lỗi đăng ký:', error);
        throw error;
    }
};

// Verify OTP
export const verifyOTP = async (email, otp) => {
    try {
        const user = await prisma.user.findUnique({ where: { email: email } });
        if (!user) {
            return { status: 404, message: 'Không tìm thấy tài khoản với email này.' };
        }

        if (user.isActive) {
            return { status: 400, message: 'Tài khoản đã được kích hoạt trước đó.' };
        }

        if (String(user.otp) !== String(otp)) {
            return { status: 400, message: 'Mã OTP không chính xác. Vui lòng kiểm tra lại.' };
        }

        if (new Date() > new Date(user.otpExpires)) {
            return { status: 400, message: 'Mã OTP đã hết hạn. Vui lòng yêu cầu gửi lại OTP mới.' };
        }

        await prisma.user.update({
            where: { id: user.id },
            data: {
                isActive: true,
                otp: null,
                otpExpires: null,
            }
        });

        return { status: 200, message: 'Kích hoạt tài khoản thành công!' };
    } catch (error) {
        console.error('Lỗi xác nhận OTP:', error);
        throw error;
    }
};

// Resend OTP
export const resendOTP = async (email) => {
    try {
        const user = await prisma.user.findUnique({ where: { email: email } });
        if (!user) {
            return { status: 404, message: 'Không tìm thấy tài khoản với email này.' };
        }

        if (user.isActive) {
            return { status: 400, message: 'Tài khoản đã được kích hoạt.' };
        }

        const otpCode = generateOTP();
        const otpExpires = getOTPExpireTime();

        await prisma.user.update({
            where: { id: user.id },
            data: {
                otp: otpCode,
                otpExpires: otpExpires,
            }
        });

        let emailSent = true;
        try {
            await sendOTPEmail(email, otpCode, user.firstName);
        } catch (emailError) {
            console.error('Không thể gửi email OTP:', emailError.message);
            emailSent = false;
        }

        const response = {
            status: 200,
            message: emailSent
                ? 'Đã gửi lại mã OTP. Vui lòng kiểm tra email của bạn.'
                : 'Đã tạo OTP mới. Tuy nhiên không thể gửi email.',
            emailSent: emailSent,
        };

        if (process.env.NODE_ENV === 'development') {
            response.devInfo = { otp: otpCode, otpExpires: otpExpires };
        }
        return response;
    } catch (error) {
        console.error('Lỗi gửi lại OTP:', error);
        throw error;
    }
};

// Login user
export const loginUser = async (email, password) => {
    try {
        const user = await prisma.user.findUnique({ where: { email: email } });
        if (!user) {
            return { status: 404, message: 'Email hoặc mật khẩu không chính xác.' };
        }

        if (!user.isActive) {
            return { status: 403, message: 'Tài khoản chưa được kích hoạt. Vui lòng kiểm tra email để nhận mã OTP.' };
        }

        const isMatch = bcrypt.compareSync(password, user.password);
        if (!isMatch) {
            return { status: 401, message: 'Email hoặc mật khẩu không chính xác.' };
        }

        const token = generateToken({ id: user.id, role: user.roleId, email: user.email });
        
        let redirectUrl = '/user/profile';
        if (user.roleId === 'admin') {
            redirectUrl = '/admin/profile';
        }

        return {
            status: 200,
            message: 'Đăng nhập thành công',
            data: {
                token,
                redirectUrl,
                user: {
                    id: user.id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    role: user.roleId
                }
            }
        };
    } catch (error) {
        console.error('Lỗi đăng nhập:', error);
        throw error;
    }
};

// Forgot Password
export const forgotPassword = async (email) => {
    try {
        const user = await prisma.user.findUnique({ where: { email: email } });
        if (!user) {
            return { status: 404, message: 'Không tìm thấy tài khoản với email này.' };
        }

        if (!user.isActive) {
            return { status: 403, message: 'Tài khoản chưa được kích hoạt.' };
        }

        const otpCode = generateOTP();
        const otpExpires = getOTPExpireTime();

        await prisma.user.update({
            where: { id: user.id },
            data: {
                otp: otpCode,
                otpExpires: otpExpires,
            }
        });

        let emailSent = true;
        try {
            await sendOTPEmail(email, otpCode, user.firstName);
        } catch (emailError) {
            console.error('Không thể gửi email OTP:', emailError.message);
            emailSent = false;
        }

        const response = {
            status: 200,
            message: emailSent
                ? 'Đã gửi mã OTP đặt lại mật khẩu. Vui lòng kiểm tra email của bạn.'
                : 'Đã tạo OTP. Tuy nhiên không thể gửi email.',
            emailSent: emailSent,
        };

        if (process.env.NODE_ENV === 'development') {
            response.devInfo = { otp: otpCode, otpExpires: otpExpires };
        }
        return response;
    } catch (error) {
        console.error('Lỗi quên mật khẩu:', error);
        throw error;
    }
};

// Reset Password
export const resetPassword = async (email, otp, newPassword) => {
    try {
        const user = await prisma.user.findUnique({ where: { email: email } });
        if (!user) {
            return { status: 404, message: 'Không tìm thấy tài khoản với email này.' };
        }

        if (String(user.otp) !== String(otp)) {
            return { status: 400, message: 'Mã OTP không chính xác. Vui lòng kiểm tra lại.' };
        }

        if (new Date() > new Date(user.otpExpires)) {
            return { status: 400, message: 'Mã OTP đã hết hạn. Vui lòng yêu cầu gửi lại OTP mới.' };
        }

        const hashedPassword = bcrypt.hashSync(newPassword, salt);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                otp: null,
                otpExpires: null,
            }
        });

        return { status: 200, message: 'Đặt lại mật khẩu thành công!' };
    } catch (error) {
        console.error('Lỗi đặt lại mật khẩu:', error);
        throw error;
    }
};
