<?php

namespace Drupal\impact_fixture;

use Drupal\Core\Config\ConfigFactoryInterface;

/**
 * Default greeter, configured by impact_fixture.settings.
 */
class Greeter implements GreeterInterface {

  public function __construct(protected ConfigFactoryInterface $configFactory) {}

  /**
   * {@inheritdoc}
   */
  public function greet(string $name): string {
    return $this->configFactory->get('impact_fixture.settings')->get('greeting') . ', ' . $name;
  }

}
