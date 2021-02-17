import * as TypeORM from "typeorm";
import Model from "./common";
import Problem from "./problem"
import User from "./user"

@TypeORM.Entity()
export default class Exercise extends Model {
    static cache = true;

    @TypeORM.PrimaryGeneratedColumn()
    id: number;

    @TypeORM.Index()
    @TypeORM.Column({ nullable: true, type: "varchar", length: 255 })
    title: string;

    @TypeORM.Column({ nullable: true, type: "text" })
    description: string;

    @TypeORM.Index()
    @TypeORM.Column({ nullable: true })
    is_public: boolean;

    @TypeORM.ManyToOne(() => User)
    creator: User;

    @TypeORM.ManyToMany(() => Problem)
    @TypeORM.JoinTable()
    problems: Problem[];

    async isAllowedDeleteBy(user) {
        if (!user) return false;
        if (user.is_admin) return true;
        return user.id === this.creator.id;
    }
}
