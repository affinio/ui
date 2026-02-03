<?php

namespace Affino\Popover\Laravel;

use Affino\Popover\Laravel\View\Components\Popover;
use Illuminate\Support\Facades\Blade;
use Illuminate\Support\ServiceProvider;

class AffinoPopoverServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        $this->loadViewsFrom(__DIR__ . '/../resources/views', 'popover-laravel');

        Blade::component('affino-popover', Popover::class);

        $this->publishes([
            __DIR__ . '/../resources/views' => resource_path('views/vendor/popover-laravel'),
        ], 'affino-popover-laravel-views');

        $this->publishes([
            __DIR__ . '/../resources/js' => resource_path('vendor/popover-laravel/js'),
            __DIR__ . '/../dist' => resource_path('vendor/popover-laravel/dist'),
        ], 'affino-popover-laravel-assets');
    }
}
