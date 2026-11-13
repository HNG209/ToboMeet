import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { NewsFeedController } from "./news-feed.controller";
import { NewsFeedService } from "./news-feed.service";
import { Post, PostSchema } from "./schemas/post.schema";
import { Comment, CommentSchema } from "./schemas/comment.schema";
import { Room, RoomSchema } from "../rooms/schemas/room.schema";
import { User, UserSchema } from "../users/schemas/user.schema";
import { CalendarEvent, CalendarEventSchema } from "../calendar/schemas/calendar-event.schema";
import { SupabaseModule } from "../supabase/supabase.module";
import { MeetingsModule } from "../meetings/meetings.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Post.name, schema: PostSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: Room.name, schema: RoomSchema },
      { name: User.name, schema: UserSchema },
      { name: CalendarEvent.name, schema: CalendarEventSchema },
    ]),
    SupabaseModule,
    MeetingsModule,
  ],
  controllers: [NewsFeedController],
  providers: [NewsFeedService],
  exports: [NewsFeedService],
})
export class NewsFeedModule {}
