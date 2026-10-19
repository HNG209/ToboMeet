import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { VectorDbService } from "./vector-db.service";

@Module({
  imports: [ConfigModule],
  providers: [VectorDbService],
  exports: [VectorDbService],
})
export class VectorDbModule {}
