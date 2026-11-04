# drupal-impact detection rules

What each detector in `drupal_impact.py` looks for, how it finds consumers,
and what it misses. Read this when a report looks wrong — a missing consumer
or a false alarm usually traces back to one of the limits below.

## How a change becomes a "piece"

1. `git diff -U0 -M <base> [<head>]`, limited to the module directory. With
   no `--head`, the working tree is compared and untracked files count as
   fully added.
2. Every changed file is parsed twice, at base and at head. A piece is
   **touched** when a changed line falls inside its span on either side.
3. Pieces are matched across the two sides by kind + ID:
   - only at head → `added`; only at base → `removed`;
   - both, and the comparable signature differs → `signature changed`
     (`path changed` for routes, `value changed` for event constants);
   - both, only the body differs → `changed`.
4. A removed piece paired with an added piece of the same kind and the same
   key (route path, permission body, plugin class) becomes `renamed`. Its
   consumers are searched by the **old** ID, since that's what callers still use.
5. An added or removed class absorbs its own methods: one row, not one per method.

Parsing is regex plus a line-based YAML reader — no PHP parser, no YAML
library. PHP comments and string contents are blanked before braces are
matched, so braces inside strings don't break spans. Heredocs aren't handled.

## Detectors

| Piece | Touched when… | Consumers found via… |
|---|---|---|
| **Service** (`service`) | its entry in `*.services.yml` changes, or the file of its `class:` changes (`implementation changed`) | `'id'`/`"id"` in PHP and Twig (`\Drupal::service()`, `->get()`), `@id`/`@?id` or the bare ID as a YAML value, `Class $var` type hints in files that import the class |
| **Public PHP API** (`php-api`) | concrete class: added, removed, declaration (`extends`/`implements`) or a public method signature changed. Interface, trait or abstract class: anything inside — each non-private method is its own piece; constants and properties count against the class | files that import the class, name it fully qualified, or share its namespace: `implements`/`extends` lines, `->m(`/`::m(` calls, `function m(` overrides. **Transitively:** every class extending/implementing it through any chain of parents, with its overriding method lines. YAML strings naming the class (`_controller`, `_form`, `class:`) |
| **Hook** (`hook`) | procedural `<module>_<hook>()` in `.module`/`.install`/`.inc`/`.theme` (update functions excluded), or a method carrying `#[Hook('name')]` | `invokeAll`/`invoke`/`invokeAllWith`/`hasImplementations` with the hook name, `->alter('x')` for `x_alter`, `hook_<name>(` in `*.api.php`, direct calls of the procedural function |
| **Plugin** (`plugin`) | a class with a plugin attribute `#[Type(id: '…')]` or annotation `@Type(id = "…")`, from the attribute down to the class's closing brace | `'id'` in PHP (`createInstance`, `getDefinition`), the ID as a YAML value (`plugin: id` in config), references to the plugin class |
| **Route** (`route`) | its top-level key in `*.routing.yml`; a changed `path:` is `path changed` | `'name'` in PHP and Twig (`Url::fromRoute`, `setRedirect`, `redirect`, `path()`, `url()`), `route_name`/`base_route`/`parent_id`/`route:` in YAML |
| **Permission** (`permission`) | its key in `*.permissions.yml`. `permission_callbacks` changes are reported as their own piece | `'perm'` in PHP (`hasPermission`, `drupalCreateUser([...])`), `_permission:` requirements (including `+`/`,` lists), `- perm` list items (role config) |
| **Config schema** (`config-schema`) | a top-level key in `config/schema/*.yml`; `keys` lists every nested key | shipped `config/install`/`config/optional` files of that name (wildcards honoured), `'config.name'` in PHP, and `->get/set/clear('key')` for removed keys in files naming the config. **Also:** any `hook_update_N`/`hook_post_update_NAME` added in the diff |
| **Event** (`event`) | `getSubscribedEvents()` subscriptions (`Class::CONST`, `SomeEvent::class`, dotted strings), and `const` values in classes named `*Events` | `dispatch(` lines naming the event, and other subscribers' `getSubscribedEvents()` naming it |

Matches in a `tests/` directory are **covering tests**, not consumers. The
suite comes from the path: `Unit`, `Kernel`, `Functional`,
`FunctionalJavascript`, else `Other`. A test also covers a PHP piece when it
imports the class.

Consumers are **in** when the file is in the module directory and **out**
when found under a `--scan` root. Other copies of the scanned module found
under a scan root (same `<module>.info.yml`) are skipped and noted.

## Risk rules

Breaking changes are `removed`, `renamed`, `signature changed`, `id changed`,
`value changed`, and `planned` (in `--symbols` mode) on a PHP API, service,
plugin, route, permission or event piece.

- **HIGH:** a breaking change with ≥1 consumer outside the module; a config
  schema piece touched with no update hook added in the diff; a permission
  removed or renamed.
- **MEDIUM:** a breaking change with consumers only inside the module; a
  breaking change on an interface/abstract class/trait with no consumer found
  (other modules may extend it); any touched piece with no covering test.
- **LOW:** everything else.

Hook and event *implementations* changing aren't breaking by themselves: the
invoker doesn't depend on any one implementation. Only the "no covering test"
rule raises them.

## Known blind spots

These always print in the report's `## Not detected by this scanner`:

- IDs built at runtime: `'module.' . $type`, `sprintf()`, variables.
- JavaScript consumers (`drupalSettings`, `Drupal.behaviors`), and Twig
  beyond quoted IDs and `path()`/`url()`.
- Runtime-only wiring: alter hooks that rewrite definitions
  (`hook_*_info_alter`, `hook_entity_type_alter`), service decorators,
  compiler passes, event constants resolved through variables.
- Body-only behaviour changes in methods whose signature is unchanged
  (reported only for services and plugins).
- Sites' own custom code and modules outside the scanned roots.
- Tests that exercise a piece without naming it (UI- or path-driven tests).

Further limits worth knowing while tuning:

- Procedural functions named `<module>_*` are all treated as hook
  implementations, so helper functions with the module prefix show up as hooks.
- Plugins with a positional ID (`#[Type('id')]`) or no `id` aren't detected.
- `#[Hook]` on a class (with `method:`) isn't detected; only on methods.
- Method calls are matched by name in files that reference the class, so a
  same-named method on another object in that file is a false positive.
- Short-name references need an import, a fully qualified name or the same
  namespace — a class referenced only through a string (`'Drupal\x\Y'` in
  PHP) is missed outside YAML.
