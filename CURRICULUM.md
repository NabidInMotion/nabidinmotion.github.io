# Curriculum submodule

`road-to-machine-learning/` is a git submodule. It is a separate clone of [NabidAlam/road-to-machine-learning](https://github.com/NabidAlam/road-to-machine-learning) with its own history and remote.

Full documentation: [subscriber-site/README.md](subscriber-site/README.md)

```bash
npm run curriculum:init    # first-time clone
npm run curriculum:sync    # pull latest and rebuild subscriber-site/content/
```

After you set `STUDY_HUB_DISPATCH_TOKEN` and `STUDY_HUB_REPO=NabidInMotion/nabidinmotion.github.io` on the curriculum repo, pushes to `main` can trigger an automatic rebuild of the site content.
