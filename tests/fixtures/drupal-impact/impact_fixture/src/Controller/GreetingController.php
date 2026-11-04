<?php

namespace Drupal\impact_fixture\Controller;

use Drupal\Core\Controller\ControllerBase;

/**
 * Renders the greeting page.
 */
class GreetingController extends ControllerBase {

  /**
   * Page callback.
   */
  public function page(): array {
    return ['#markup' => \Drupal::service('impact_fixture.greeter')->greet('world')];
  }

}
