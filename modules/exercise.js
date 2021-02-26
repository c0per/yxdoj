let Exercise = syzoj.model('exercise');
let ExerciseTag = syzoj.model('exercise_tag');
let ExerciseTagMap = syzoj.model('exercise_tag_map');
let Problem = syzoj.model('problem');

app.get('/exercises', async (req, res) => {
    try {
        const sort = req.query.sort || 'id';
        const order = req.query.order || 'asc'; // TODO: hardcoded value -> config
        if (!['id', 'title'].includes(sort) || !['asc', 'desc'].includes(order)) {
            throw new ErrorMessage('错误的排序参数。');
        }

        let query = Exercise.createQueryBuilder();
        query.orderBy(sort, order.toUpperCase());

        let paginate = syzoj.utils.paginate(await Exercise.countForPagination(query), req.query.page, 12); // TODO: hardcoded value -> config
        let exercises = await Exercise.queryPage(paginate, query);

        exercises = await exercises.mapAsync(e => Exercise.findOne(e.id));

        await exercises.mapAsync(async e => {
            e.tags = await e.getTags();
            await Promise.all(e.problems.map(async p => {
                p.judge_state = await p.getJudgeState(res.locals.user, true);
            }));
        });

        res.render('exercises', {
            allowedManageTag: res.locals.user && await res.locals.user.hasPrivilege('manage_exercise_tag'),
            exercises: exercises,
            paginate: paginate,
            curSort: sort,
            curOrder: order === 'asc'
        });
    } catch(e) {
        syzoj.log(e);
        res.render('error', {
            err: e
        });
    }
});

app.get('/exercises/tag/:tagIDs', async (req, res) => {
    try { 
        let tagIDs = Array.from(new Set(req.params.tagIDs.split(',').map(x => parseInt(x))));
        let tags = await tagIDs.mapAsync(async tagID => ExerciseTag.findById(tagID));
        const sort = req.query.sort || 'id';
        const order = req.query.order || 'asc'; // TODO: harcode -> config
        if (!['id', 'title'].includes(sort) || !['asc', 'dasc'].includes(order)) {
            throw new ErrorMessage('错误的排序参数。');
        }
        let sortVal = '`exercise`.`' + sort + '`';

        for (let tag of tags) {
            if (!tag) {
                return res.redirect(syzoj.utils.makeUrl(['exercises']));
            }
        }

        let sql = 'SELECT `id` FROM `exercise` WHERE\n';
        for (let tagID of tagIDs) {
            if (tagID !== tagIDs[0]) {
                sql += 'AND\n';
            }
            sql += '`exercise`.`id` IN (SELECT `exercise_id` FROM `exercise_tag_map` WHERE `tag_id` = ' + tagID + ')';
        }

        if (!res.locals.user) {
            sql += 'AND (`exercise`.`is_public` = 1)';
        } else if (!await res.locals.user.hasPrivilege('manage_exercise')) {
            sql += 'AND (`exercise`.`is_public` = 1 OR `exercise`.`user_id` = ' + res.locals.user.id + ')';
        }

        let paginate = syzoj.utils.paginate(await Exercise.countQuery(sql), req.query.page, 12); // TODO: hardcode -> config
        let exercises = await Exercise.query(sql + `ORDER BY ${sortVal} ${order} ` + paginate.toSQL());

        exercises = await exercises.mapAsync(async e => {
            e = await Exercise.findOne(e.id);
            e.tags = await e.getTags();
            await Promise.all(e.problems.map(async p => {
                p.judge_state = await p.getJudgeState(res.locals.user, true);
            }));
            return e;
        });

        res.render('exercises', {
            allowedManageTag: res.locals.user && await res.locals.user.hasPrivilege('manage_exercise_tag'),
            exercises,
            tags,
            paginate,
            curSort: sort,
            curOrder: order === 'asc'
        });
    } catch(e) {
        syzoj.log(e);
        res.render('error', {
            err: e
        });
    }
});

app.get('/exercise/:id/edit', async (req, res) => {
    try {
        let id = parseInt(req.params.id) || 0;
        let exercise = await Exercise.findOne(id);

        if (!exercise) {
            if (!res.locals.user) throw new ErrorMessage('请登录后继续。', { '登录': syzoj.utils.makeUrl(['login'], { 'url': req.originalUrl }) });
            exercise = await Exercise.create({
                id: 0
            });
            exercise.problems = [];
            exercise.tags = [];
        } else {
            exercise.tags = await exercise.getTags();
        }

        res.render('exercise_edit', {
            exercise
        });
    } catch(e) {
        syzoj.log(e);
        res.render('error', {
            err: e
        });
    }
});

app.post('/exercise/:id/edit', async (req, res) => {
    try {
        // User login
        if (!res.locals.user) throw new ErrorMessage('您没有权限进行此操作。');
        //TODO: User privilege system

        let exercise_id = parseInt(req.params.id);
        let exercise = await Exercise.findById(exercise_id);

        if (!exercise) {
            exercise = await Exercise.create();
        }

        if (!req.body.title.trim()) throw new ErrorMessage('比赛名不能为空。');
        exercise.title = req.body.title;
        exercise.description = req.body.description;
        exercise.is_public = req.body.is_public === 'on';
        if (!Array.isArray(req.body.problems)) req.body.problems = [req.body.problems];
        exercise.creator = res.locals.user;
        exercise.problems = await req.body.problems.mapAsync(p => {
            let p_id = parseInt(p);
            return Problem.findById(p_id);
        });

        await exercise.save();

        if (!req.body.tags) {
            req.body.tags = [];
        } else if (!Array.isArray(req.body.tags)) {
            req.body.tags = [req.body.tags];
        }

        let newTagIDs = await req.body.tags.map(x => parseInt(x)).filterAsync(async x => ExerciseTag.findById(x));
        await exercise.setTags(newTagIDs);

        res.redirect(syzoj.utils.makeUrl(['exercise', exercise.id]));
    } catch (e) {
        syzoj.log(e);
        res.render('error', {
            err: e
        });
    }
});

app.get('/exercise/:id', async (req, res) => {
    try {
        const sort = req.query.sort || 'id';
        const order = req.query.order || 'asc'; // TODO: hardcoded value -> config
        if (!['id', 'title'].includes(sort) || !['asc', 'desc'].includes(order)) {
            throw new ErrorMessage('错误的排序参数。');
        }

        let exercise_id = parseInt(req.params.id);
        let exercise = await Exercise.findOne(exercise_id);
        if (!exercise) throw new ErrorMessage('无此练习。');
        if (!exercise.is_public && (!res.locals.user || !res.locals.user.is_admin)) throw new ErrorMessage('练习未公开，请耐心等待 (´∀ `)');

        if (!res.locals.user) {
            exercise.problems = exercise.problems.filter(p => p.is_public);
        } else if (!res.locals.user.is_admin) {
            exercise.problems = exercise.problems.filter(p => p.is_public || p.user_id === res.locals.user.id);
        }
        exercise.problems.sort((a, b) => a[sort] < b[sort] && order === 'asc' ? -1 : 1);

        exercise.allowedDetele = exercise.isAllowedDeleteBy(res.locals.user);

        await exercise.problems.mapAsync(async p => {
            p.judge_state = await p.getJudgeState(res.locals.user, true);
        });

        res.render('exercise', {
            exercise: exercise,
            curSort: sort,
            curOrder: order === 'asc'
        });
    } catch (e) {
        syzoj.log(e);
        res.render('error', {
            err: e
        });
    }
});

let togglePublic = async (req, res, is_public) => {
    try {
        let id = parseInt(req.params.id);
        let exercise = await Exercise.findById(id);
        if (!exercise) throw new ErrorMessage('无此练习。');

        //TODO: check user privilege

        exercise.is_public = is_public;
        await problem.save();

        res.redirect(syzoj.utils.makeUrl(['exercise', id]));
    } catch (e) {
        syzoj.log(e);
        res.render('error', {
            err: e
        });
    }
};

app.post('/exercise/:id/public', async (req, res) => {
    await togglePublic(req, res, true);
});

app.post('/exercise/:id/dis_public', async (req, res) => {
    await togglePublic(req, res, false);
});

app.post('/exercise/:id/delete', async (req, res) => {
    try {
        let id = parseInt(req.params.id);
        let exercise = await Exercise.findById(id);
        if (!exercise) throw new ErrorMessage('无此练习。');

        if (!await exercise.isAllowedDeleteBy(res.locals.user)) throw new ErrorMessage('您没有权限进行此操作。');

        await exercise.destroy();

        res.redirect(syzoj.utils.makeUrl(['exercises']));
    } catch (e) {
        syzoj.log(e);
        res.render('error', {
            err: e
        });
    }
});
