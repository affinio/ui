<?php

namespace Affino\Tooltip\Laravel;

use Affino\Tooltip\Laravel\View\Components\Tooltip;
use Illuminate\Support\Facades\Blade;
use Illuminate\Support\ServiceProvider;

class AffinoTooltipServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        $this->loadViewsFrom(__DIR__ . '/../resources/views', 'tooltip-laravel');

        Blade::component('affino-tooltip', Tooltip::class);

        $this->publishes([
            __DIR__ . '/../resources/views' => resource_path('views/vendor/tooltip-laravel'),
        ], 'affino-tooltip-laravel-views');

        $this->publishes([
            __DIR__ . '/../resources/js' => resource_path('vendor/tooltip-laravel/js'),
            __DIR__ . '/../dist' => resource_path('vendor/tooltip-laravel/dist'),
        ], 'affino-tooltip-laravel-assets');
    }
}
