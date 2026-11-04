<?php

namespace Drupal\impact_consumer;

use Drupal\impact_fixture\GreeterInterface;

/**
 * Shouts the greeting.
 */
class LoudGreeter implements GreeterInterface {

  public function greet(string $name): string {
    return strtoupper('Hello, ' . $name);
  }

}
