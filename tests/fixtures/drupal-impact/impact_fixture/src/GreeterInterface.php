<?php

namespace Drupal\impact_fixture;

/**
 * Builds greetings.
 */
interface GreeterInterface {

  /**
   * Greets someone by name.
   */
  public function greet(string $name): string;

}
