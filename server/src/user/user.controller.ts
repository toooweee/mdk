import {
    Controller,
    Delete,
    Get,
    Param,
    ParseUUIDPipe,
    UseGuards,
    ForbiddenException,
    NotFoundException,
    Logger,
    Res,
} from '@nestjs/common';
import { UserService } from '@user/user.service';
import { UserResponse } from '@user/responses';
import { CurrentUser, Roles } from '@common/decorators';
import { JwtPayload } from '@auth/interfaces';
import { RolesGuard } from '@auth/guards/role.guard';
import { JwtAuthGuard } from '@auth/guards/jwt-auth.guard';
import { Role } from '@prisma/client';
import * as fs from 'node:fs';
import { Response } from 'express'; // Обязательно импортируем Response из express

@Controller('user')
@UseGuards(JwtAuthGuard)
export class UserController {
    private readonly logger = new Logger(UserController.name);

    constructor(private readonly userService: UserService) {}

    @UseGuards(RolesGuard)
    @Roles(Role.ADMIN)
    @Get()
    async findAllUsers() {
        this.logger.log('Fetching all users');
        const users = await this.userService.findAll();
        this.logger.log(`Found ${users.length} users`);
        return users.map((user) => new UserResponse(user));
    }

    @Get(':idOrEmail')
    async findOneUser(@Param('idOrEmail') idOrEmail: string) {
        this.logger.log(`Fetching user with idOrEmail: ${idOrEmail}`);
        const user = await this.userService.finOne(idOrEmail);
        if (!user) {
            throw new NotFoundException('User not found');
        }
        return new UserResponse(user);
    }

    @Delete(':id')
    async deleteUser(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
        if (user.id !== id && !user.roles.includes(Role.ADMIN)) {
            throw new ForbiddenException('You are not allowed to delete this user');
        }
        this.logger.log(`Deleting user with id: ${id}`);
        const deletedUser = await this.userService.delete(id, user);
        if (!deletedUser) {
            throw new NotFoundException('User not found');
        }
        return { message: 'User deleted successfully' };
    }

    @UseGuards(RolesGuard)
    @Roles(Role.ADMIN)
    @Get('me')
    me(@CurrentUser() user: JwtPayload) {
        this.logger.log(`Fetching current user: ${user.id}`);
        return user;
    }

    @Roles(Role.ADMIN)
    @UseGuards(RolesGuard)
    @Get('export/csv')
    async exportUsersCSV(@Res() res: Response) {
        const filePath = await this.userService.exportUsersToCSV();
        const fileStream = fs.createReadStream(filePath); // читаем файл, а не поток записи
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=users.csv');
        fileStream.pipe(res);
    }

    @Roles(Role.ADMIN)
    @UseGuards(RolesGuard)
    @Get('export/xlsx')
    async exportUsersXLSX(@Res() res: Response) {
        const buffer = await this.userService.exportUsersToXLSX();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=users.xlsx');
        res.send(buffer); // Используем res.send() для отправки буфера в ответ
    }
}
