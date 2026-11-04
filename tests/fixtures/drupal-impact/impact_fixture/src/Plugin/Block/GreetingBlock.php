<?php

namespace Drupal\impact_fixture\Plugin\Block;

use Drupal\Core\Block\Attribute\Block;
use Drupal\Core\Block\BlockBase;
use Drupal\Core\StringTranslation\TranslatableMarkup;
use Drupal\Core\Url;

/**
 * Links to the greeting page.
 */
#[Block(
  id: 'impact_fixture_greeting',
  admin_label: new TranslatableMarkup('Greeting link'),
)]
class GreetingBlock extends BlockBase {

  /**
   * {@inheritdoc}
   */
  public function build() {
    return [
      '#type' => 'link',
      '#title' => $this->t('Say hello'),
      '#url' => Url::fromRoute('impact_fixture.greeting'),
    ];
  }

}
