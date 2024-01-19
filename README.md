# Algorithmic web toys

Try at <https://timgott.github.io/algovis/>

## What is this

Loose collection of web based experiments I am building for work or for fun.
Most involve somewhat advanced algorithmic techniques, but all of them are cool
to play with, even without knowing what they are doing.

Highlights include

- Stickman trying to reach mouse
- Adversarial playground for local graph coloring
- Interactive demo of the splay operation for self-balancing heaps

There are a lot of interesting things going on under the hood. Unfortunately, I
have not written anything up yet, so just take my word for it that there is some
pretty code doing cool things.

## Build

Install dependencies with

```
npm install
```

Then, run development server with

```
npm run serve
```

or build static files in `dist/` with

```
npm run build
```

## Structure

Each project has its own folder. Code shared between multiple projects is in the `shared` folder.

The projects are all in this one repo to make it very easy to start something new by reusing code and infrastructure.
