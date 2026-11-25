import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FeaturePageData } from '../feature-page.data';

@Component({
  selector: 'app-feature-page',
  imports: [RouterLink],
  templateUrl: './feature-page.html',
  styleUrl: './feature-page.css',
})
export class FeaturePage {
  readonly featurePage = input.required<FeaturePageData>();
}
