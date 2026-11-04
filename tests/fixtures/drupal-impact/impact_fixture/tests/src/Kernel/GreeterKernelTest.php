<?php

namespace Drupal\Tests\impact_fixture\Kernel;

use Drupal\impact_fixture\GreeterInterface;
use Drupal\KernelTests\KernelTestBase;

/**
 * @group impact_fixture
 */
class GreeterKernelTest extends KernelTestBase {

  protected static $modules = ['impact_fixture'];

  public function testServiceUsesConfig(): void {
    $this->installConfig(['impact_fixture']);
    $greeter = $this->container->get('impact_fixture.greeter');
    $this->assertInstanceOf(GreeterInterface::class, $greeter);
    $this->assertSame('Hello, Ada', $greeter->greet('Ada'));
    $this->assertSame('Hello', $this->config('impact_fixture.settings')->get('greeting'));
  }

}
