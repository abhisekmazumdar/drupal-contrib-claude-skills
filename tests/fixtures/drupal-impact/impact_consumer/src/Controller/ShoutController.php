<?php

namespace Drupal\impact_consumer\Controller;

use Drupal\Core\Controller\ControllerBase;
use Drupal\Core\Url;

/**
 * Sends people to the fixture's greeting page.
 */
class ShoutController extends ControllerBase {

  public function redirectToGreeting() {
    return $this->redirect('impact_fixture.greeting');
  }

  public function link(): Url {
    return Url::fromRoute('impact_fixture.greeting');
  }

}
