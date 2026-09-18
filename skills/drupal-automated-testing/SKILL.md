---
name: drupal-automated-testing
description: >
  Guidance for writing or modifying automated tests for Drupal modules (core, contrib, custom). Covers Functional, Kernel, FunctionalJavascript, and Unit tests; required PHPUnit attributes; test namespaces; the Functional dual-container trap; DDEV env vars; and mistakes agents often make.
---

# Writing automated tests for Drupal

Drupal's testing conventions are idiosyncratic — general PHP testing advice and default AI-agent instincts get them wrong. This guidance covers what differs.

## When tests are needed

Bug fixes: almost always — without one the bug can silently return. Behaviour changes: almost always. Config-only changes: usually not. Modifying an existing feature? Find and update its existing test first. Adding one? Cover the happy path and the most likely error paths.

## Choose the right test type

Reach for **Functional or Kernel first** — not Unit, despite what general PHP advice suggests. Drupal code is mostly services/hooks/entities wired through a DI container; integration-level tests are where the value is.

- **Functional** (`\Drupal\Tests\BrowserTestBase`) — the default choice. Boots a real site with all config/schema installed; tests PHP APIs and UI both. Use for HTTP requests, forms, pages, or a dependency tree too complex to set up by hand.
- **Kernel** (`\Drupal\KernelTests\KernelTestBase`) — services, APIs, hooks with no UI. Faster than Functional, but a minimal environment: no config installed, no entity tables created, no dependency resolution. Call `$this->installEntitySchema('node')`, `$this->installConfig(['my_module'])`, etc. explicitly. "Table does not exist" in a Kernel test almost always means a missing install call.
- **FunctionalJavascript** (`\Drupal\FunctionalJavascriptTests\WebDriverTestBase`) — only for JS-driven UI (AJAX, modals, dynamic visibility). Prone to flakiness from async timing. Always assert `waitForElement`'s result — it returns `NULL` on no-match, and an unasserted `NULL` is a silent false pass:
  ```php
  // Wrong: doesn't wait for the result.
  $this->assertSession()->waitForElement('css', '#page-title');

  // Correct: waits and asserts.
  $this->assertNotEmpty(
    $this->assertSession()->waitForElement('css', '#page-title')
  );
  ```
  After a button press that triggers AJAX: wait for the expected element, then assert.
- **Unit** (`\Drupal\Tests\UnitTestCase`) — pure functions with no container dependency. Uncommon in Drupal.
- **Build** (`\Drupal\BuildTests\Framework\BuildTestBase`) — codebase-layout scenarios like Composer dependency resolution.

## Required class attributes

Kernel/Functional/FunctionalJavascript classes need `#[RunTestsInSeparateProcesses]` (`use PHPUnit\Framework\Attributes\RunTestsInSeparateProcesses;`) — hard requirement since Drupal 11.3, strongly recommended on 10.x. Unit tests run in-process; skip it there.

## Test namespaces

Wrong namespace = the test runner won't discover it:

- Unit: `\Drupal\Tests\<module>\Unit`
- Kernel: `\Drupal\Tests\<module>\Kernel`
- Functional: `\Drupal\Tests\<module>\Functional`
- FunctionalJavascript: `\Drupal\Tests\<module>\FunctionalJavascript` — capitalization matters

## The dual-container trap in Functional tests

Functional tests run two Drupal instances (PHPUnit process + web server) sharing one database but separate PHP memory. State set in one (a registered service, a set variable) is invisible to the other — source of confusing caching/service-registration bugs. A targeted cache clear or container rebuild may fix it; comment why when it does.

## Running tests

Use DDEV. PHPUnit requires two env vars: `SIMPLETEST_BASE_URL` (the site's local HTTP address) and `SIMPLETEST_DB` (the DB connection string).

## Reducing test repetition

Multiple similar cases? Use `setUp()`, data providers, or `#[TestWith]` — don't duplicate code across test methods.

## What not to do

Don't write Nightwatch tests — flaky, JS-based, the community's moving to Playwright.

## See also

- [Drupal automated testing guide](https://www.drupal.org/docs/develop/automated-testing)
- [PHPUnit in Drupal](https://www.drupal.org/docs/develop/automated-testing/phpunit-in-drupal)
- [KernelTestBase API](https://api.drupal.org/api/drupal/core%21tests%21Drupal%21KernelTests%21KernelTestBase.php/class/KernelTestBase/11.x)
- [BrowserTestBase API](https://api.drupal.org/api/drupal/core%21tests%21Drupal%21Tests%21BrowserTestBase.php/class/BrowserTestBase/11.x)
