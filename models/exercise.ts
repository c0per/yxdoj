import * as TypeORM from "typeorm";
import Model from "./common";

declare var syzoj, ErrorMessage: any;

import Problem from "./problem";
import ExerciseTag from "./exercise_tag";
import ExerciseTagMap from "./exercise_tag_map";
import User from "./user";

import * as LRUCache from "lru-cache";

const exerciseTagCache = new LRUCache<number, number[]>({
  max: syzoj.config.db.cache_size
});

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

    @TypeORM.ManyToOne(type => User, { eager: true })
    creator: User;

    @TypeORM.ManyToMany(type => Problem, problem => problem.exercises, { eager: true })
    @TypeORM.JoinTable()
    problems: Problem[];

    async isAllowedDeleteBy(user) {
        if (!user) return false;
        if (user.is_admin) return true;
        return user.id === this.creator.id;
    }

    async getTags() {
        let tagIDs;
        if (exerciseTagCache.has(this.id)) {
            tagIDs = exerciseTagCache.get(this.id);
        } else {
            let maps = await ExerciseTagMap.find({
                where: {
                    exercise_id: this.id
                }
            });

            tagIDs = maps.map(x => x.tag_id);
            exerciseTagCache.set(this.id, tagIDs);
        }

        let res = await (tagIDs as any).mapAsync(async tagId => ExerciseTag.findById(tagId));

        res.sort((a, b) => a.color > b.color ? 1 : -1);

        return res;
    }

    async setTags(newTagIDs) {
        let oldTagIDs = (await this.getTags()).map(x => x.id);

        let delTagIDs = oldTagIDs.filter(x => !newTagIDs.includes(x));
        let addTagIDs = newTagIDs.filter(x => !oldTagIDs.includes(x));

        for (let tagID of delTagIDs) {
            let map = await ExerciseTagMap.findOne({
                where: {
                    exercise_id: this.id,
                    tag_id: tagID
                }
            });
            await map.destroy();
        }

        for (let tagID of addTagIDs) {
            let map = await ExerciseTagMap.create({
                exercise_id: this.id,
                tag_id: tagID
            });
            await map.save();
        }

        exerciseTagCache.set(this.id, newTagIDs);
    }
}
