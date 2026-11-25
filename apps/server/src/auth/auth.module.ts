import { Module } from "@nestjs/common";
import { SupabaseModule } from "../supabase/supabase.module";
import { DesktopAuthController } from "./desktop-auth.controller";
import { DesktopAuthService } from "./desktop-auth.service";

@Module({
  imports: [SupabaseModule],
  controllers: [DesktopAuthController],
  providers: [DesktopAuthService],
  exports: [DesktopAuthService],
})
export class AuthModule {}

