<?php

namespace Drupal\Tests\impact_fixture\Unit;

use Drupal\impact_fixture\Greeter;
use Drupal\impact_fixture\GreeterInterface;
use Drupal\Tests\UnitTestCase;

/**
 * @coversDefaultClass \Drupal\impact_fixture\Greeter
 * @group impact_fixture
 */
class GreeterTest extends UnitTestCase {

  public function testGreet(): void {
    $greeter = new Greeter($this->getConfigFactoryStub(['impact_fixture.settings' => ['greeting' => 'Hi']]));
    $this->assertInstanceOf(GreeterInterface::class, $greeter);
    $this->assertSame('Hi, Ada', $greeter->greet('Ada'));
  }

}
