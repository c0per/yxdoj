let ExerciseTag = syzoj.model('exercise_tag');

app.get('/exercises/tag/:id/edit', async (req, res) => {
    try {
        if (!res.locals.user || !await res.locals.user.hasPrivilege('manage_exercise_tag')) throw new ErrorMessage('您没有权限进行此操作。');

        let id = parseInt(req.params.id) || 0;
        let tag = await ExerciseTag.findById(id);

        if (!tag) {
            tag = await ExerciseTag.create();
            tag.id = id;
        }

        res.render('exercise_tag_edit', { tag: tag });
    } catch (e) {
        syzoj.log(e);
        res.render('error', {
            err: e
        });
    }
});

app.post('/exercises/tag/:id/edit', async (req, res) => {
    try {
        if (!res.locals.user || !await res.locals.user.hasPrivilege('manage_exercise_tag')) throw new ErrorMessage('您没有权限进行此操作。');

        let id = parseInt(req.params.id) || 0;
        let tag = await ExerciseTag.findById(id);

        if (!tag) {
            tag = await ExerciseTag.create();
            tag.id = id;
        }

        req.body.name = req.body.name.trim();
        if (tag.name !== req.body.name && await ExerciseTag.findOne({ where: { name: req.body.name }})) {
            throw new ErrorMessage('标签名称已被使用。');
        }

        tag.name = req.body.name;
        tag.color = req.body.color;

        await tag.save();

        res.redirect(syzoj.utils.makeUrl(['exercises', 'tag', tag.id]));
    } catch (e) {
        syzoj.log(e);
        res.render('error', {
            err: e
        });
    }
});
