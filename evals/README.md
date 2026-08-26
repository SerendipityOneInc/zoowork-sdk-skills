# Evals

A skill body is a prompt. Editing it is not like editing code: a change that fixes one task can
quietly degrade another, and nothing fails loudly when it does. These evals are the tripwire.

## What they measure

Each eval is a realistic task prompt plus assertions about the code an assistant produces in
response. The assertions target the specific mistakes an assistant makes on this API *without* the
skill - waiting on `actual_state` forever, forgetting `startAgent()`, treating one page of
`listEvents` as a whole session, inventing a custom-tool API that does not exist.

That framing is the point: an assertion only earns its place if an unaided assistant plausibly fails
it. An assertion both arms pass tells you nothing about whether the skill works.

Nothing here calls a live deployment. The evals grade generated code, so they cost no API quota, mutate
no tenant, and can run on any machine. Whether the API itself behaves as documented is the SDK's
question, and it is answered by the SDK's own test suite and probes.

## Running them

For each eval, run the same prompt twice: once with the skill available to the assistant, once
without. The baseline is what makes the result meaningful.

1. Make two empty directories, say `with-skill/` and `baseline/`.
2. Run the eval's `prompt` in each, in a fresh session, with the assistant writing its files into
   that directory. For the baseline, make sure the skill is *not* installed or reachable - a skill
   picked up from `~/.claude/skills/` silently ruins the comparison.
3. Save the assistant's prose reply into the directory too, as `answer.md`. Some evals - eval 4
   especially - are answered correctly in prose rather than in code, and the checker reads both.
4. Check each directory:

```bash
node evals/check.mjs with-skill/
```

```bash
node evals/check.mjs baseline/
```

The interesting number is the gap. A skill that scores 9/9 while the baseline also scores 9/9 is not
carrying its weight on that task; a baseline that scores 3/9 tells you which assertions are doing
real work.

`--eval <id>` limits the run to one eval, and `--json` prints machine-readable output for scripting.
Exit status is non-zero when anything failed.

## Reading the result

The checker matches regular expressions over every file in the directory, concatenated. That is
crude on purpose - it is fast, deterministic, and dependency-free - and it has the failure modes you
would expect:

- **False pass.** A pattern matched inside a comment, or in a sentence explaining why the code does
  *not* do that thing.
- **False fail.** The assistant did the right thing by a route the pattern does not describe.

So treat a failure as a question rather than a verdict. Open the file and look. If the assistant was
right and the assertion was wrong, fix the assertion - a wrong assertion is worse than no assertion,
because it pushes the next edit in the wrong direction.

One `absent` failure mode deserves naming, because it inverts the whole measurement: **an `absent`
assertion on a term only this skill introduces cannot discriminate.** The unaided arm has never
heard of `actual_state` or the `chat.delta` lane, so it passes by ignorance; the skill-equipped arm
mentions them to explain why it avoided them, and fails. Two assertions were written that way and
scored the correct answer below the baseline until 2026-08-26. If the risk you want to guard is
"do not use X", assert on code that *uses* X - a property read, an accumulation - and never on the
name alone, or assert the positive counterpart instead.

## Adding an eval

Add an entry to `evals.json` with a realistic prompt - something a developer would actually type,
with their own context in it, not an abstract instruction. Then write assertions that are:

- **Objective.** Checkable by pattern, with no judgment call.
- **Discriminating.** An unaided assistant should plausibly fail them.
- **Named as a claim.** `"starts the agent after creating it"` reads clearly in the output;
  `"assertion 3"` does not.

Three assertion kinds are available: `present` passes when any pattern matches, `absent` passes when
none do, and `order` passes when each pattern first appears after the previous one.
