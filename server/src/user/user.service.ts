import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import { Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { JwtPayload } from '@auth/interfaces';
import { writeToPath } from 'fast-csv';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class UserService {
    private readonly logger = new Logger(UserService.name);
    constructor(private readonly prismaService: PrismaService) {}

    async save(user: Partial<User>) {
        const hashedPassword = this.hashPassword(user.password);
        return this.prismaService.user.create({
            data: {
                email: user.email,
                password: hashedPassword,
                roles: user.roles ?? ['USER'], // Установка роли по умолчанию
            },
        });
    }

    async findAll(): Promise<User[]> {
        this.logger.log('Fetching all users from the database');
        try {
            return this.prismaService.user.findMany();
        } catch (error) {
            this.logger.error('Failed to fetch users', error);
            throw error;
        }
    }

    finOne(idOrEmail: string) {
        return this.prismaService.user.findFirst({
            where: {
                OR: [{ id: idOrEmail }, { email: idOrEmail }],
            },
        });
    }

    async delete(id: string, user: JwtPayload) {
        const userToDelete = await this.prismaService.user.findUnique({ where: { id } });

        if (!userToDelete) {
            throw new NotFoundException('User not found');
        }

        if (user.id !== id && !user.roles.includes(Role.ADMIN)) {
            throw new ForbiddenException('You are not allowed to delete this user');
        }

        return this.prismaService.user.delete({
            where: { id },
            select: { id: true },
        });
    }

    // Исправленный метод для экспорта в CSV
    async exportUsersToCSV(): Promise<string> {
        const users = await this.findAll();

        // Проверяем, есть ли данные
        if (!users || users.length === 0) {
            throw new Error('Нет данных для экспорта.');
        }

        const exportDir = path.join(process.cwd(), 'exports');

        // Проверяем, существует ли папка, и создаём, если нет
        if (!fs.existsSync(exportDir)) {
            fs.mkdirSync(exportDir, { recursive: true });
        }

        const filePath = path.join(exportDir, 'users.csv');

        // Возвращаем Promise, чтобы гарантировать завершение записи
        return new Promise((resolve, reject) => {
            writeToPath(filePath, users, {
                headers: true,
                transform: (row: User) => ({
                    id: row.id,
                    email: row.email,
                    createdAt: row.createdAt,
                    updatedAt: row.updatedAt,
                }),
            })
                .on('finish', () => {
                    console.log(`Файл успешно создан: ${filePath}`);

                    // Проверяем, что файл не пустой
                    const stats = fs.statSync(filePath);
                    if (stats.size === 0) {
                        reject(new Error('Файл пустой после записи!'));
                    } else {
                        resolve(filePath);
                    }
                })
                .on('error', (error) => {
                    console.error('Ошибка записи CSV:', error);
                    reject(new Error('Не удалось создать файл CSV'));
                });
        });
    }



    // Метод для экспорта в XLSX (с буфером)
    async exportUsersToXLSX(): Promise<Buffer> {
        const users = await this.findAll();
        const ws = XLSX.utils.json_to_sheet(
            users.map((user) => ({
                id: user.id,
                email: user.email,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
            })),
        );
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Users');
        const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

        this.logger.log('Users exported to XLSX successfully');
        return buffer;
    }

    private hashPassword(password: string) {
        return bcrypt.hashSync(password, bcrypt.genSaltSync(10));
    }
}
