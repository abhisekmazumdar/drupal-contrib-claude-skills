---
name: drupal-php-changes
description: >
  Apply knowledge of PHP-related changes introduced in Drupal 11.x when reviewing,
  fixing, or contributing to Drupal issues. Use when the user asks about PHP
  compatibility, deprecations, PHPUnit upgrades, PHP attributes, OOP hooks, fibers,
  or when reviewing code that needs to pass Drupal 11 CI.
argument-hint: "[drupal-version or topic]"
---

# /drupal-php-changes

**Purpose:** Apply awareness of PHP-related changes across Drupal 11.x when working
on contribution issues, reviewing MRs, or writing new code. This skill covers:
PHP version requirements, PHP Attribute adoption, PHPUnit changes, PHP 8.4
compatibility, fibers, OOP hooks, database driver changes, and key deprecations.

**Usage:**
```
/drupal-php-changes
/drupal-php-changes 11.3
/drupal-php-changes attributes
/drupal-php-changes phpunit
```

---

## PHP Version Requirements for Drupal 11

- **Minimum:** PHP 8.3
- **Supported:** PHP 8.3, PHP 8.4
- Drupal 12 will raise the minimum further; contrib modules targeting both D11 and D12
  must not use PHP features unavailable in 8.3.

When reviewing a patch or MR, check that:
- No PHP 8.4-only syntax is used unless the change record explicitly targets 8.4+
- PHP 8.3 typed properties, readonly classes, and named arguments are acceptable
- `trigger_error(E_USER_ERROR)` is **deprecated** as of 11.1.x — use exceptions instead
- PHP sessions use strict mode by default as of 11.2.x — do not pass a non-empty session ID to `session_id()` before `session_start()`

---

## PHP Attributes: The Big Shift (11.1.x → 11.4.x)

Drupal is actively migrating from docblock annotations to native PHP attributes.
This is the **most impactful PHP change** for contrib developers.

> **Note (11.x / 10.6.x):** `doctrine/annotations` has been forked into Drupal core itself
> (`drupal/annotations`). Annotation-based plugin discovery still works but is backed by
> the internal fork — no external `doctrine/annotations` dependency is required.
> This is transparent for most contrib, but confirms annotations will keep working during
> the transition period while attribute classes are added.

### What changed

| Version | Change |
|---------|--------|
| 11.2.x  | Plugins converted from Annotations to Attributes; `DefaultPluginManager` tries attribute before annotation |
| 11.2.x  | Not providing a PHP attribute class for annotation-based plugin discovery is **deprecated** |
| 11.2.x  | Hook implementations can now be removed with `#[RemoveHook]` |
| 11.3.x  | `PluginBase::create()` factory method now supports autowired parameters |
| 11.3.x  | New `#[TwigAllowed]` method attribute for Twig-accessible methods |
| 11.3.x  | `#[RunTestsInSeparateProcesses]` attribute **required** on all Kernel, Functional, and FunctionalJavascript test classes |
| 11.3.x  | `getDependencies()` / `setDependencies()` added to the plugin Attribute interface (`AttributeInterface`) — attribute classes can now declare dependencies |
| 11.4.x  | PHP Attributes can now define and discover **routes** (replaces `*.routing.yml` for simple routes) |
| 11.4.x  | Constraint plugins must use **named arguments** instead of an options array |
| 11.4.x  | `FormBase::create()` factory method now supports autowired parameters |
| 11.4.x  | Query parameters can be mapped directly to controller method arguments |

### What to do in contribution work

- When writing a new plugin, use a PHP Attribute class instead of an annotation.
- When fixing an existing plugin, check if CI warns about missing attribute — add the
  attribute class to avoid the deprecation notice.
- Every new Kernel/Functional/FunctionalJS test class **must** have
  `#[RunTestsInSeparateProcesses]` above the class declaration (11.3.x+).
- For constraint plugins, replace `$configuration['option']` patterns with named
  constructor arguments.

### Example: adding RunTestsInSeparateProcesses

```php
<?php

use PHPUnit\Framework\Attributes\RunTestsInSeparateProcesses;

#[RunTestsInSeparateProcesses]
class MyModuleKernelTest extends KernelTestBase {
  // ...
}
```

---

## PHPUnit Changes

| Version | Change |
|---------|--------|
| 11.2.x  | PHPUnit 10 attribute syntax now **supported** |
| 11.2.x  | PHPUnit **11** support added |
| 11.2.x  | `run-tests.sh` now uses PHPUnit's own API to discover tests |
| 11.2.x  | Added `DebugDump` extension for PHPUnit |
| 11.3.x  | PHPUnit **10** support **removed** — minimum is PHPUnit 11 |
| 11.3.x  | Added `--phpunit-configuration` argument to `run-tests.sh` |
| 11.4.x  | Kernel tests can now make HTTP requests with `drupalGet()` |
| 11.4.x  | `TestRequirementsTrait` is **deprecated** — use PHPUnit attributes / requirements instead |
| 12.0.x _(forward compat)_ | `run-tests.sh --types` now requires PHPUnit test suite names |
| 12.0.x _(forward compat)_ | Tests will report missing return types in Drupal code |
| 12.0.x _(forward compat)_ | PHPUnit attribute equivalents **required** — docblock `@group`/`@covers` no longer accepted |

### What to do in contribution work

- Use PHPUnit 11 annotations/attributes — PHPUnit 9-style `@group`, `@covers` docblocks
  still work but PHP attribute equivalents are preferred in new code.
- When running tests locally, use `--phpunit-configuration` to point at a specific
  `phpunit.xml` if needed.
- Ensure all test classes targeting 11.3+ have `#[RunTestsInSeparateProcesses]`.

---

## PHP Fibers

Relevant only for core render pipeline or async work. If you encounter fiber suspension points, check the `FiberResumeType` enum (11.3.x) — it communicates _why_ a fiber is resumed. Not relevant for typical contrib module issues.

---

## PHP 8.4 Compatibility

| Version | Change |
|---------|--------|
| 11.1.x  | `trigger_error(E_USER_ERROR)` deprecated — use exceptions |
| 11.2.x  | PHP sessions now use **strict mode** by default (`session.use_strict_mode = 1`) |
| 11.3.x  | Use specific PDO driver classes instead of `PDOConnection` on PHP 8.4+ |
| 11.4.x  | Password hashing algorithm and options are now configurable via **kernel parameters** |
| 12.0.x  | Default password hashing algorithm changed to **argon2id** (was bcrypt-based); can be reverted via kernel parameters if argon2 is unavailable |

PHP 8.4 deprecates implicit `PDOConnection` usage — replace `new \PDO(...)` or `\PDOConnection` references with the Drupal database driver API. This is low-level database driver work; most contrib modules won't touch it directly.

The argon2id switch in Drupal 12 is transparent to users (existing hashes still verify), but contrib code that reads/writes password hashes directly must not assume a fixed algorithm.

---

## OOP Hooks

| Version | Change |
|---------|--------|
| 11.3.x  | Hooks in **themes** can now be implemented as OOP methods |

Procedural `hook_*` functions in `.theme` files can be replaced with OOP-style
implementations inside a class. When working on theme-related issues, prefer OOP
hooks in new code for Drupal 11.3+.

---

## OOP / Interface Signature Changes (11.2.x → 11.4.x)

Several interfaces and plugin managers changed their method signatures or moved
from procedural functions to services. When implementing or overriding these,
update signatures and switch to the OOP/service replacement to avoid CI failures.

| Version | Change |
|---------|--------|
| 11.2.x  | New `InstallRequirementsInterface` provides install-time requirements as an OOP class (replaces the procedural `hook_install_requirements()` pattern) |
| 11.4.x  | Implementations of `ExecutableInterface::execute()` now **require** an `$object` argument |
| 11.4.x  | Implementations of `CategorizingPluginManagerInterface::getSortedDefinitions()` and `::getGroupedDefinitions()` now **require** a `$labelKey` argument |
| 11.4.x  | New `FileReferenceResolver` service replaces the procedural `file_get_file_references()` |
| 11.4.x  | New repository service for filter formats replaces `filter_formats()`, `filter_formats_reset()`, `filter_get_formats_by_role()`, `filter_default_format()`, `filter_fallback_format()` |
| 11.4.x  | `\Drupal\user\OneTimeAuthentication` service replaces procedural `user_pass_rehash()`, `user_cancel_url()`, `user_mail_tokens()`, `user_pass_reset_url()` (removed in 13.0) |
| 11.4.x  | `EntityTypeInterface::getOriginalClass()` is **deprecated** — no longer needed since entity type class overrides now work cumulatively |
| 11.4.x  | `SessionManager::delete()` is **deprecated** — use `\Drupal\Core\Session\UserSessionRepository::deleteAll()` instead |

When implementing one of these interfaces, match the new required argument exactly —
omitting it is a fatal error on 11.4+, not just a deprecation.

---

## Key Deprecations Affecting Contribution Code

These deprecated APIs will trigger CI warnings or errors. Fix them when you encounter
them in MRs or patches:

| Deprecated | Replacement | Since |
|------------|-------------|-------|
| `trigger_error(E_USER_ERROR)` | Throw an exception | 11.1.x |
| `DRUPAL_DISABLED`, `DRUPAL_OPTIONAL`, `DRUPAL_REQUIRED` | Use `\Drupal\Core\Extension\RequiredModuleStatus` enum or equivalent constants | 11.3.x |
| Annotation-only plugin discovery (no attribute class) | Add a PHP Attribute class | 11.2.x |
| `\PDOConnection` direct usage | Drupal database driver API | 11.3.x |
| Accessing `autoload` global | Use the service container or `DrupalInstalled` class | 11.4.x |
| `expectDeprecation()` in tests | Use Symfony's `ExpectDeprecationTrait` | 11.4.x |
| `TestRequirementsTrait` | PHPUnit attributes / requirements | 11.4.x |
| `ToStringTrait` | Implement `__toString()` directly | 11.4.x |
| Render `hide()` / `show()` functions | Manipulate the render array (`#printed` / `#access`) directly | 11.4.x |
| `check_markup()` procedural function | See change record (filter pipeline service) | 11.4.x |
| `file_get_file_references()` | `FileReferenceResolver` service | 11.4.x |
| `filter_formats()` & related procedural functions | Filter format repository service | 11.4.x |
| `user_pass_rehash()`, `user_cancel_url()`, `user_mail_tokens()`, `user_pass_reset_url()` | Methods on `\Drupal\user\OneTimeAuthentication` | 11.4.x |
| `user_load_by_mail()`, `user_load_by_name()` | Load `User` entities via `\Drupal\user\UserStorageInterface` by property | 11.4.x |
| `user_cookie_save()`, `user_cookie_delete()` | See [change record 3581570](https://www.drupal.org/node/3581570) for replacements | 11.4.x |
| `SessionManager::delete()` | `\Drupal\Core\Session\UserSessionRepository::deleteAll()` | 11.4.x |
| `EntityTypeInterface::getOriginalClass()` | No longer needed; entity type class overrides now stack correctly | 11.4.x |

---

## New APIs Worth Using in Contribution Code

These are new, non-deprecated APIs introduced in Drupal 11.x that improve code quality:

- **`symfony/polyfill-php86`** (11.4.x) — PHP 8.6 polyfill available; use new PHP 8.6
  functions without breaking 8.3 compatibility.
- **Autowired `create()` factories** (11.3.x PluginBase, 11.4.x FormBase) — Constructor
  dependencies are auto-injected; remove manual `$container->get()` boilerplate.
- **`mysqli` database driver** (11.3.x) — Enables parallel queries; use for performance-
  sensitive database work.
- **`#[RemoveHook]` attribute** (11.2.x) — Remove a parent class hook implementation
  without overriding the whole method.
- **`symfony/runtime` bootstrap separation** (11.4.x) — Drupal's bootstrap now uses
  `symfony/runtime`; this separates the kernel from the HTTP handler and enables
  cleaner CLI/HTTP entry points. Affects custom entry-point scripts.
- **Password hashing via kernel parameters** (11.4.x) — The algorithm and options passed
  to `password_hash()` are now configurable in `services.yml` kernel parameters. Drupal 12
  switches the default to `argon2id`; contrib code should use the password manager service
  and not hard-code algorithm names.

---

## Checklist: PHP concerns when reviewing/writing a Drupal 11 MR

Use this when the `drupal-issue-agent` hands you a patch or MR to review:

- [ ] No PHP < 8.3 syntax; no PHP 8.4-only syntax unless explicitly stated
- [ ] Plugins use PHP Attribute classes (not annotation-only)
- [ ] Test classes have `#[RunTestsInSeparateProcesses]` (11.3+)
- [ ] No `trigger_error(E_USER_ERROR)` — use exceptions
- [ ] No `DRUPAL_DISABLED` / `DRUPAL_OPTIONAL` / `DRUPAL_REQUIRED` constants
- [ ] No raw `PDOConnection` usage
- [ ] Constraint plugins use named arguments
- [ ] PHPUnit tests use PHPUnit 11 compatible style; tests use PHPUnit attributes (not docblock annotations) for 12.0 readiness
- [ ] Interface implementations match new required args (`ExecutableInterface::execute($object)`, `CategorizingPluginManagerInterface::get*Definitions($labelKey)`)
- [ ] Deprecated procedural functions replaced with their service equivalents (`file_get_file_references()`, `filter_formats()`, `check_markup()`, `hide()`/`show()`, `user_pass_rehash()`, `user_cancel_url()`, `user_mail_tokens()`, `user_pass_reset_url()`, `user_load_by_mail()`, `user_load_by_name()`, `user_cookie_save()`, `user_cookie_delete()`)
- [ ] No `SessionManager::delete()` calls — use `UserSessionRepository::deleteAll()`
- [ ] No `EntityTypeInterface::getOriginalClass()` calls (deprecated 11.4.x)
- [ ] Password hashing code uses the password manager service, not hard-coded algorithms

---

## Reference Links

- Change records (filtered to PHP): https://www.drupal.org/list-changes/drupal?keywords_description=PHP
- Drupal 11 system requirements: https://www.drupal.org/docs/getting-started/system-requirements/drupal-11-php-requirements
- PHP Attributes in Drupal: https://www.drupal.org/docs/drupal-apis/php-attributes
- PHPUnit in Drupal: https://www.drupal.org/docs/automated-testing/phpunit-in-drupal
