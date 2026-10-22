import { forwardRef, Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppGateway } from './gateways/app.gateway';
import { Notification, NotificationSchema } from '../notifications/schemas/notification.schema';
import { NotificationsModule } from '../notifications/notifications.module';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Notification.name, schema: NotificationSchema }]),
    forwardRef(() => NotificationsModule),
  ],
  providers: [AppGateway],
  exports: [AppGateway], // Bắt buộc export để module khác dùng được Gateway này
})
export class CoreModule {}